"use client"

import { useQuery } from "convex-helpers/react/cache"
import { ArrowLeftIcon, CompassIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useRef, useState } from "react"

import { api } from "@roomer/backend/convex/_generated/api"
import { toRoomGeometry } from "@roomer/core/geometry"
import { lint as lintLayout } from "@roomer/core/lint"
import type { LintIssue } from "@roomer/core/schema"
import { Button } from "@roomer/ui/components/button"
import { EmptyState } from "@roomer/ui/components/empty-state"

import { ActivityFeed } from "@/components/activity/activity-feed"
import { LintCounts } from "@/components/common/lint-counts"
import { issueKey } from "@/components/issues/issue-row"
import { IssueList } from "@/components/issues/issue-list"
import { ItemList } from "@/components/items/item-list"
import type { PlanDrag } from "@/components/plan/plan-view"
import { Inspector, type InspectorTab } from "@/components/workspace/inspector"
import { StageCaption } from "@/components/workspace/stage-caption"
import type { ViewMode } from "@/components/workspace/view-mode-control"
import { useHotkey } from "@/components/workspace/use-hotkey"
import { WorkspaceFrame } from "@/components/workspace/workspace-frame"
import { useLayoutEditor } from "@/hooks/use-layout-editor"
import { useNow } from "@/hooks/use-now"
import { useRecentAssets } from "@/hooks/use-recent-assets"
import { useSafeQuery } from "@/hooks/use-safe-query"
import { useSearchParam } from "@/hooks/use-search-param"
import type { PlanKeyAction } from "@/lib/plan-edit/keyboard"
import {
  EMPTY_SELECTION,
  addToSelection,
  groupBounds,
  groupNudgeOps,
  groupRotateOps,
  rectCentre,
  selectAll,
  selectedIds as selectedIdsOf,
  selectionOf,
  toggleSelected,
  withOffsets,
  type Selection,
} from "@/lib/plan-edit/group"
import { moveOp } from "@/lib/plan-edit/optimistic"
import { planFootprints } from "@/lib/workspace/footprints"
import {
  activityEvents,
  asId,
  assetSpecs,
  defaultLayout,
  entityLabels,
  liveLayoutIds,
  placedItems,
  roomStats,
  toLayoutSummary,
  toRenderSummary,
} from "@/lib/workspace/view-models"

import { AssetPicker } from "./asset-picker"
import { LayoutsRail } from "./layouts-rail"
import { RendersPanel } from "./renders-panel"
import { useItemPlacing } from "./use-item-placing"
import { WorkspaceStage } from "./workspace-stage"

/**
 * /rooms/[roomId]: the live workspace. Everything is a Convex query, so the
 * agent's edits stream in as they happen; the user's own edits (plan drags,
 * keyboard nudges) apply optimistically and are linted locally while
 * dragging.
 */
export function RoomWorkspace({ roomId: rawRoomId }: { roomId: string }) {
  const roomId = asId<"rooms">(rawRoomId)
  const roomQuery = useSafeQuery(api.rooms.get, { roomId })
  const room = roomQuery.data ?? undefined
  const roomReady = room !== undefined
  const layoutRows = useQuery(
    api.layouts.listByRoom,
    roomReady ? { roomId } : "skip"
  )
  const activity = useQuery(
    api.layouts.activity,
    roomReady ? { roomId } : "skip"
  )
  const now = useNow()

  const [requestedLayout, setRequestedLayout] = useSearchParam("layout")
  const current =
    layoutRows?.find((l) => l._id === requestedLayout) ??
    defaultLayout(layoutRows ?? [])
  const layoutId = current?._id
  const layout = useQuery(api.layouts.get, layoutId ? { layoutId } : "skip")
  const events = useQuery(
    api.layouts.events,
    layoutId ? { layoutId, limit: 50 } : "skip"
  )
  const renderRows = useQuery(
    api.renders.listByLayout,
    layoutId ? { layoutId } : "skip"
  )

  const editor = useLayoutEditor({ roomId, layoutId })

  const [mode, setMode] = useState<ViewMode>("plan")
  const [tab, setTab] = useState<InspectorTab>("issues")
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION)
  const [hoverIds, setHoverIds] = useState<string[]>([])
  const [selectedIssueKey, setSelectedIssueKey] = useState<string>()
  const [drag, setDrag] = useState<PlanDrag | null>(null)
  const dragRevision = useRef<number | undefined>(undefined)

  const geometry = useMemo(() => (room ? toRoomGeometry(room) : null), [room])
  const assets = useMemo(
    () => (layout ? assetSpecs(layout.assets) : {}),
    [layout]
  )
  const serverPlacements = useMemo(() => layout?.placements ?? [], [layout])
  const placements = useMemo(
    () =>
      drag
        ? withOffsets(serverPlacements, drag.ids, drag.dx, drag.dz)
        : serverPlacements,
    [drag, serverPlacements]
  )
  // While dragging, lint the preview locally for live feedback; otherwise
  // show the server's report.
  const lint = useMemo(() => {
    if (!drag || !geometry) return layout?.lint
    return lintLayout({ room: geometry, placements, assets })
  }, [drag, geometry, placements, assets, layout?.lint])

  const labels = useMemo(
    () => entityLabels(layout ?? undefined, room?.features ?? []),
    [layout, room?.features]
  )
  const layouts = useMemo(() => {
    if (!layoutRows) return undefined
    const live = liveLayoutIds(activity, now)
    return layoutRows.map((row) => toLayoutSummary(row, live.has(row._id)))
  }, [layoutRows, activity, now])
  const items = useMemo(
    () => (layout ? placedItems(layout) : undefined),
    [layout]
  )
  const feed = useMemo(
    () => (events ? activityEvents(events) : undefined),
    [events]
  )
  const renders = useMemo(() => renderRows?.map(toRenderSummary), [renderRows])

  // The selection, in layout order, without items that no longer exist
  // (the agent removed them).
  const selected = useMemo(
    () => selectedIdsOf(selection, serverPlacements),
    [selection, serverPlacements]
  )
  const selectOnly = (id: string | null) =>
    setSelection(id ? selectionOf([id]) : EMPTY_SELECTION)
  const selectedIssue: LintIssue | undefined = lint?.issues.find(
    (issue) => issueKey(issue) === selectedIssueKey
  )

  // Adding items: the picker, then placing a ghost on the plan.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [recentAssets, rememberAsset] = useRecentAssets()
  const placingItem = useItemPlacing({
    room: geometry,
    placements: serverPlacements,
    assets,
    revision: layout?.revision,
    apply: editor.apply,
    onPlaced: (placementId, asset) => {
      rememberAsset(asset._id)
      selectOnly(placementId)
      setSelectedIssueKey(undefined)
    },
    onCancelled: (viaDrag) => {
      if (!viaDrag) setPickerOpen(true)
    },
  })
  const openPicker = () => {
    setMode("plan")
    setDrag(null)
    if (placingItem.asset) placingItem.stop()
    setPickerOpen((open) => !open || placingItem.asset !== null)
  }
  const canAdd = layout !== undefined && layout !== null
  useHotkey("a", openPicker, mode !== "walk" && canAdd)

  const selectLayout = (id: string) => {
    selectOnly(null)
    setSelectedIssueKey(undefined)
    setHoverIds([])
    setRequestedLayout(id)
  }

  const onDrag = (next: PlanDrag | null) => {
    if (next && !drag) dragRevision.current = layout?.revision
    setDrag(next)
  }

  const onDrop = (done: PlanDrag) => {
    setDrag(null)
    if (done.dx === 0 && done.dz === 0) return
    // The agent changed the layout mid-drag: the live query already shows
    // it, so say so instead of sending a move the server would refuse.
    if (
      dragRevision.current !== undefined &&
      layout?.revision !== dragRevision.current
    ) {
      editor.conflict()
      return
    }
    const [only] = done.ids
    const single =
      done.ids.length === 1
        ? serverPlacements.find((p) => p.id === only)
        : undefined
    // One item moves to an absolute (grid-snapped) centre; a group moves
    // by one offset, as one batch: one revision, one activity event.
    const ops = single
      ? [moveOp(single, single.x + done.dx, single.z + done.dz)]
      : groupNudgeOps(done.ids, done.dx, done.dz)
    if (ops.length === 0) return
    void editor.apply(ops, { expectedRevision: dragRevision.current })
  }

  const footprints = useMemo(
    () => planFootprints(serverPlacements, assets),
    [serverPlacements, assets]
  )

  const onKeyAction = (action: PlanKeyAction) => {
    if (action.kind === "deselect") {
      selectOnly(null)
      return
    }
    if (action.kind === "selectAll") {
      setSelection(selectAll(serverPlacements))
      return
    }
    const group = serverPlacements.filter((p) => selection[p.id])
    if (group.length === 0) return
    const expectedRevision = layout?.revision
    if (action.kind === "remove") {
      selectOnly(null)
      void editor.removeMany(
        group,
        group.length === 1
          ? (labels[group[0]!.id] ?? group[0]!.id)
          : `${group.length} items`,
        expectedRevision
      )
      return
    }
    if (action.kind === "nudge") {
      void editor.apply(
        groupNudgeOps(
          group.map((p) => p.id),
          action.dx,
          action.dz
        ),
        { expectedRevision }
      )
      return
    }
    // Rotate: one item turns about its own centre; a group about the
    // centre of its combined outline.
    if (group.length === 1) {
      void editor.apply(
        [{ op: "nudge", id: group[0]!.id, rotate: action.degrees }],
        { expectedRevision }
      )
      return
    }
    const bounds = groupBounds(
      footprints.filter((f) => selection[f.id]).map((f) => f.outline)
    )
    if (!bounds) return
    void editor.apply(
      groupRotateOps(group, rectCentre(bounds), action.degrees),
      {
        expectedRevision,
      }
    )
  }

  if (
    roomQuery.status === "error" ||
    (roomQuery.status === "ready" && !roomQuery.data)
  ) {
    return <RoomNotFound />
  }

  const stats = room ? roomStats(room) : null
  const cameras = room?.cameras ?? []

  return (
    <WorkspaceFrame
      rail={
        <LayoutsRail
          roomId={roomId}
          layouts={layouts}
          selectedId={layoutId}
          onSelect={selectLayout}
        />
      }
      stage={
        geometry && room ? (
          <WorkspaceStage
            roomId={roomId}
            layoutId={layoutId}
            mode={mode}
            onModeChange={(next) => {
              setMode(next)
              if (next !== "plan") {
                placingItem.stop()
                setPickerOpen(false)
              }
            }}
            room={geometry}
            finishes={layout?.finishes ?? room.finishes}
            cameras={cameras}
            placements={placements}
            assets={assets}
            lint={lint}
            labels={labels}
            ready={layout !== undefined && layout !== null}
            empty={layoutRows !== undefined && layoutRows.length === 0}
            selection={{
              selectedIds: selected,
              onSelect: (id, { toggle } = { toggle: false }) => {
                if (toggle && id) {
                  setSelection((current) => toggleSelected(current, id))
                  return
                }
                selectOnly(id)
                if (id === null) setSelectedIssueKey(undefined)
              },
              onMarquee: (ids, { add }) =>
                setSelection((current) =>
                  add ? addToSelection(current, ids) : selectionOf(ids)
                ),
              hoverIds,
              onHover: setHoverIds,
              highlight: selectedIssue
                ? {
                    ids: selectedIssue.placementIds,
                    severity: selectedIssue.severity,
                    code: selectedIssue.code,
                  }
                : undefined,
            }}
            drag={drag}
            onDrag={onDrag}
            onDrop={onDrop}
            onKeyAction={onKeyAction}
            placing={mode === "plan" ? placingItem.placing : null}
            pickerOpen={pickerOpen}
            onAddItem={openPicker}
            picker={
              <AssetPicker
                recentIds={recentAssets}
                onClose={() => setPickerOpen(false)}
                onPick={(asset) => {
                  setPickerOpen(false)
                  selectOnly(null)
                  placingItem.start(asset)
                }}
                onDragStart={(asset) => {
                  selectOnly(null)
                  placingItem.start(asset, { viaDrag: true })
                }}
                onDragEnd={(dropped) => {
                  // A drop has placed the item; a drag let go anywhere else
                  // just stops, leaving the picker open.
                  placingItem.stop()
                  if (dropped) setPickerOpen(false)
                }}
              />
            }
            caption={
              stats ? (
                <StageCaption
                  roomName={room.name}
                  layoutName={layout?.name ?? current?.name}
                  stats={stats}
                  trailing={
                    layout ? (
                      <>
                        <span
                          data-revision={layout.revision}
                          className="font-mono tabular-nums"
                        >
                          r{layout.revision}
                        </span>
                        {lint ? <LintCounts counts={lint.counts} /> : null}
                      </>
                    ) : null
                  }
                />
              ) : null
            }
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-background bg-drafting text-ui text-muted-foreground">
            Loading the room…
          </div>
        )
      }
      inspector={
        <Inspector
          value={tab}
          onValueChange={setTab}
          counts={{
            issues: lint?.counts,
            items: layout ? placements.length : undefined,
            activity: feed?.length,
            renders: renders?.length,
          }}
          issues={
            <IssueList
              issues={layoutRows?.length === 0 ? [] : lint?.issues}
              labels={labels}
              selectedKey={selectedIssueKey}
              onHover={setHoverIds}
              onSelect={(issue) => {
                const key = issueKey(issue)
                const same = key === selectedIssueKey
                setSelectedIssueKey(same ? undefined : key)
                selectOnly(same ? null : (issue.placementIds[0] ?? null))
              }}
            />
          }
          items={
            <ItemList
              items={layoutRows?.length === 0 ? [] : items}
              selectedIds={selected}
              onSelect={(id, { toggle }) => {
                if (toggle) {
                  setSelection((current) => toggleSelected(current, id))
                } else {
                  selectOnly(
                    selected.length === 1 && selected[0] === id ? null : id
                  )
                }
              }}
              onClearSelection={() => selectOnly(null)}
              onHover={(id) => setHoverIds(id ? [id] : [])}
            />
          }
          activity={
            <ActivityFeed events={layoutRows?.length === 0 ? [] : feed} />
          }
          renders={
            <RendersPanel
              layoutId={layoutId}
              cameras={cameras}
              renders={layoutRows?.length === 0 ? [] : renders}
            />
          }
        />
      }
    />
  )
}

function RoomNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <EmptyState
        icon={<CompassIcon />}
        title="There's no room here"
        description="It may have been removed, or the link is wrong."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <ArrowLeftIcon data-icon="inline-start" />
              All rooms
            </Link>
          </Button>
        }
      />
    </div>
  )
}
