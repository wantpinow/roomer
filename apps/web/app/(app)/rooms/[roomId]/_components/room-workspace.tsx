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
import { WorkspaceFrame } from "@/components/workspace/workspace-frame"
import { useLayoutEditor } from "@/hooks/use-layout-editor"
import { useNow } from "@/hooks/use-now"
import { useSafeQuery } from "@/hooks/use-safe-query"
import { useSearchParam } from "@/hooks/use-search-param"
import type { PlanKeyAction } from "@/lib/plan-edit/keyboard"
import { moveOp, withPosition } from "@/lib/plan-edit/optimistic"
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

import { LayoutsRail } from "./layouts-rail"
import { RendersPanel } from "./renders-panel"
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
        ? withPosition(serverPlacements, drag.id, drag.x, drag.z)
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

  // Forget selections that no longer exist (the agent removed the item).
  const selected =
    selectedId && placements.some((p) => p.id === selectedId)
      ? selectedId
      : null
  const selectedIssue: LintIssue | undefined = lint?.issues.find(
    (issue) => issueKey(issue) === selectedIssueKey
  )

  const selectLayout = (id: string) => {
    setSelectedId(null)
    setSelectedIssueKey(undefined)
    setHoverIds([])
    setRequestedLayout(id)
  }

  const onDrag = (next: PlanDrag | null) => {
    if (next && !drag) dragRevision.current = layout?.revision
    setDrag(next)
  }

  const onDrop = (done: PlanDrag) => {
    const placement = serverPlacements.find((p) => p.id === done.id)
    setDrag(null)
    if (!placement || (placement.x === done.x && placement.z === done.z)) return
    void editor.apply([moveOp(placement, done.x, done.z)], {
      expectedRevision: dragRevision.current,
    })
  }

  const onKeyAction = (action: PlanKeyAction) => {
    if (action.kind === "deselect") {
      setSelectedId(null)
      return
    }
    const placement = selected
      ? serverPlacements.find((p) => p.id === selected)
      : undefined
    if (!placement) return
    if (action.kind === "remove") {
      setSelectedId(null)
      void editor.remove(
        placement,
        labels[placement.id] ?? placement.id,
        layout?.revision
      )
      return
    }
    void editor.apply([action.op], { expectedRevision: layout?.revision })
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
            mode={mode}
            onModeChange={setMode}
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
              selectedId: selected,
              onSelect: (id) => {
                setSelectedId(id)
                if (id === null) setSelectedIssueKey(undefined)
              },
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
            caption={
              stats ? (
                <StageCaption
                  roomName={room.name}
                  layoutName={layout?.name ?? current?.name}
                  stats={stats}
                  trailing={
                    layout ? (
                      <>
                        <span className="font-mono tabular-nums">
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
                setSelectedId(same ? null : (issue.placementIds[0] ?? null))
              }}
            />
          }
          items={
            <ItemList
              items={layoutRows?.length === 0 ? [] : items}
              selectedId={selected ?? undefined}
              onSelect={(id) => setSelectedId(id === selected ? null : id)}
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
