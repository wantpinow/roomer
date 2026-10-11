"use client"

import { PlusIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useMemo, useState } from "react"

import type { RoomGeometry } from "@roomer/core/geometry"
import type {
  AssetSpec,
  Camera,
  Finishes,
  LintReport,
  LintSeverity,
  Placement,
} from "@roomer/core/schema"
import { Button } from "@roomer/ui/components/button"
import { Kbd } from "@roomer/ui/components/kbd"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roomer/ui/components/select"

import { SeverityIcon } from "@/components/common/severity-icon"
import {
  PlanView,
  type PlanDrag,
  type PlanPlacing,
} from "@/components/plan/plan-view"
import { useTheme } from "@/components/shell/use-theme"
import { FloatingBar, Stage } from "@/components/workspace/stage"
import {
  ViewModeControl,
  type ViewMode,
} from "@/components/workspace/view-mode-control"
import { ZoomControls } from "@/components/workspace/zoom-controls"
import { formatPosition } from "@/lib/format/position"
import type { PlanKeyAction } from "@/lib/plan-edit/keyboard"
import {
  FIT_VIEWPORT,
  ZOOM_STEP,
  zoomAt,
  type PlanViewport,
} from "@/lib/plan-edit/viewport"
import type { CameraView, SceneContent } from "@/lib/scene/types"

import { WalkStage } from "./walk-stage"

// three.js only runs in the browser.
const RoomViewer = dynamic(
  () => import("@/components/scene/room-viewer").then((m) => m.RoomViewer),
  {
    ssr: false,
    loading: () => <StageMessage>Loading the 3D view…</StageMessage>,
  }
)

export interface StageSelection {
  selectedId: string | null
  onSelect: (id: string | null) => void
  hoverIds: readonly string[]
  onHover: (ids: string[]) => void
  /** The selected issue's items and severity, washed in the plan. */
  highlight?: { ids: readonly string[]; severity: LintSeverity; code: string }
}

/**
 * The centre of the workspace: Plan (editable), 3D (orbit), Camera (the
 * room's saved viewpoints) or Walk, with the mode switch, zoom controls and
 * the title-block caption.
 */
export function WorkspaceStage({
  mode,
  onModeChange,
  room,
  finishes,
  cameras,
  placements,
  assets,
  lint,
  labels,
  ready,
  empty,
  selection,
  drag,
  onDrag,
  onDrop,
  onKeyAction,
  placing,
  picker,
  pickerOpen,
  onAddItem,
  caption,
}: {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  room: RoomGeometry
  finishes: Finishes | undefined
  cameras: readonly Camera[]
  placements: readonly Placement[]
  assets: Readonly<Record<string, AssetSpec>>
  lint: LintReport | undefined
  labels: Readonly<Record<string, string>>
  /** False while the layout is loading. */
  ready: boolean
  /** The room has no layouts yet. */
  empty: boolean
  selection: StageSelection
  drag: PlanDrag | null
  onDrag: (drag: PlanDrag | null) => void
  onDrop: (drag: PlanDrag) => void
  onKeyAction: (action: PlanKeyAction) => void
  /** Placing a new item (plan mode only). */
  placing: PlanPlacing | null
  /** The add-item picker, docked in the stage while open. */
  picker: React.ReactNode
  pickerOpen: boolean
  /** The toolbar's Add item control (switches to Plan first). */
  onAddItem: () => void
  caption: React.ReactNode
}) {
  const { theme } = useTheme()
  const [viewport, setViewport] = useState<PlanViewport>(FIT_VIEWPORT)
  const [cameraId, setCameraId] = useState<string | undefined>()
  const camera = cameras.find((c) => c.id === cameraId) ?? cameras[0]

  const scene = useMemo<SceneContent | null>(() => {
    const view: CameraView | null =
      mode === "3d"
        ? { kind: "orbit" }
        : mode === "camera" && camera
          ? { kind: "camera", camera }
          : null
    if (!view) return null
    return {
      room: { ...room, finishes },
      placements: [...placements],
      assets: { ...assets },
      view,
      pass: "clay",
    }
  }, [room, finishes, placements, assets, mode, camera])

  const walkScene = useMemo(
    () => ({
      room: { ...room, finishes },
      placements: [...placements],
      assets: { ...assets },
    }),
    [room, finishes, placements, assets]
  )

  const selected = selection.selectedId
    ? placements.find((p) => p.id === selection.selectedId)
    : undefined

  let content: React.ReactNode
  if (empty) {
    content = (
      <StageMessage>
        No layouts yet. Ask the agent to furnish this room — or start one with
        the + in the layouts rail.
      </StageMessage>
    )
  } else if (!ready) {
    content = <StageMessage>Loading the layout…</StageMessage>
  } else if (mode === "plan") {
    content = (
      <PlanView
        room={room}
        placements={placements}
        assets={assets}
        lint={lint}
        theme={theme ?? "light"}
        viewport={viewport}
        onViewportChange={setViewport}
        selectedId={selection.selectedId}
        highlightIds={selection.highlight?.ids}
        highlightSeverity={selection.highlight?.severity}
        hoverIds={selection.hoverIds}
        onHover={(id) => selection.onHover(id ? [id] : [])}
        onSelect={selection.onSelect}
        onDrag={onDrag}
        onDrop={onDrop}
        onKeyAction={onKeyAction}
        placing={placing}
      />
    )
  } else if (mode === "walk") {
    content = (
      <WalkStage scene={walkScene} onExit={() => onModeChange("plan")} />
    )
  } else if (mode === "camera" && !camera) {
    content = <StageMessage>This room has no saved cameras yet.</StageMessage>
  } else if (scene) {
    content = (
      <RoomViewer
        key={mode === "camera" ? `camera:${camera?.id}` : "orbit"}
        scene={scene}
        selection={[
          ...(selection.selectedId ? [selection.selectedId] : []),
          ...selection.hoverIds,
          ...(selection.highlight?.ids ?? []),
        ]}
        onSelectionChange={selection.onSelect}
      />
    )
  }

  return (
    <Stage
      toolbar={
        <div className="flex items-center gap-2">
          <ViewModeControl value={mode} onValueChange={onModeChange} />
          <Button
            variant="outline"
            size="sm"
            aria-pressed={pickerOpen || placing !== null}
            disabled={empty || !ready}
            onClick={onAddItem}
            className="h-9 rounded-full border-border bg-popover px-3.5 shadow-float aria-pressed:border-clay/30 aria-pressed:bg-clay-tint aria-pressed:text-clay"
          >
            <PlusIcon data-icon="inline-start" />
            Add item
            <Kbd className="ml-0.5">A</Kbd>
          </Button>
        </div>
      }
      panel={mode === "plan" && pickerOpen ? picker : null}
      controls={
        mode === "plan" && ready ? (
          <ZoomControls
            zoom={viewport.zoom}
            onZoomIn={() => setViewport((v) => zoomAt(v, ZOOM_STEP))}
            onZoomOut={() => setViewport((v) => zoomAt(v, 1 / ZOOM_STEP))}
            onFit={() => setViewport(FIT_VIEWPORT)}
          />
        ) : null
      }
      overlay={
        mode === "plan" && placing ? (
          <FloatingBar
            data-slot="placing-hint"
            className="gap-2.5 rounded-md py-1.5 pr-3 pl-3 text-xs text-ink-soft"
          >
            <span className="max-w-48 truncate font-medium text-foreground">
              Placing {placing.label}
            </span>
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Kbd>R</Kbd> turn
            </span>
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Kbd>⇧</Kbd>click again
            </span>
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Kbd>Alt</Kbd> free
            </span>
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Kbd>Esc</Kbd> cancel
            </span>
          </FloatingBar>
        ) : mode === "camera" && cameras.length > 0 ? (
          <FloatingBar className="gap-2 rounded-md py-1 pr-1 pl-3">
            <span className="eyebrow">Camera</span>
            <Select value={camera?.id} onValueChange={setCameraId}>
              <SelectTrigger
                size="sm"
                aria-label="Camera"
                className="min-w-44 border-0 shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="top">
                {cameras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FloatingBar>
        ) : mode === "plan" && drag ? (
          <FloatingBar className="gap-2 rounded-md py-1.5 pr-3 pl-3 font-mono text-2xs text-ink-soft">
            <span className="text-foreground">
              {labels[drag.id] ?? drag.id}
            </span>
            <span aria-hidden className="text-faint">
              ·
            </span>
            <span className="tabular-nums">
              {formatPosition(undefined, drag)}
            </span>
            <span className="pl-1 font-sans text-muted-foreground">
              <Kbd>Alt</Kbd> free
            </span>
          </FloatingBar>
        ) : mode === "plan" && selected ? (
          <FloatingBar className="gap-2.5 rounded-md py-1.5 pr-3 pl-3 text-xs text-ink-soft">
            <span className="max-w-48 truncate font-medium text-foreground">
              {labels[selected.id] ?? selected.id}
            </span>
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> nudge
            </span>
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Kbd>R</Kbd> turn
            </span>
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Kbd>⌫</Kbd> remove
            </span>
          </FloatingBar>
        ) : selection.highlight ? (
          <FloatingBar className="gap-2 rounded-md py-1.5 pr-3 pl-2.5 text-xs">
            <SeverityIcon severity={selection.highlight.severity} />
            <span className="font-mono text-2xs text-muted-foreground">
              {selection.highlight.code}
            </span>
            <span className="max-w-64 truncate text-ink-soft">
              {selection.highlight.ids
                .map((id) => labels[id] ?? id)
                .join(" × ")}
            </span>
          </FloatingBar>
        ) : null
      }
      caption={caption}
    >
      {content}
    </Stage>
  )
}

function StageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-full items-center justify-center p-10">
      <p className="max-w-sm text-center text-ui leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  )
}
