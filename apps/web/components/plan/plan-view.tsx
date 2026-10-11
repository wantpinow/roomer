"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { Point, RoomGeometry } from "@roomer/core/geometry"
import { planSvg } from "@roomer/core/plan"
import type {
  AssetSpec,
  LintReport,
  LintSeverity,
  Placement,
} from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

import { SeverityIcon } from "@/components/common/severity-icon"
import type { SnapTarget } from "@/lib/plan-edit/placing"
import { planKeyAction, type PlanKeyAction } from "@/lib/plan-edit/keyboard"
import {
  dragTarget,
  exceedsDragThreshold,
  toPlanPoint,
  type DragStart,
} from "@/lib/plan-edit/pointer"
import {
  panBy,
  viewportTransform,
  zoomAt,
  type PlanViewport,
} from "@/lib/plan-edit/viewport"
import { planTheme } from "@/lib/plan-theme"
import { planFootprints, svgPoints } from "@/lib/workspace/footprints"

export interface PlanDrag {
  id: string
  x: number
  z: number
}

/** The item being placed, as the plan draws it under the pointer. */
export interface PlanGhost {
  /** Its outline in room mm (one ring per separate piece). */
  outline: readonly (readonly Point[])[]
  /** The worst lint severity it would cause, or null for none. */
  severity: LintSeverity | null
  /** The asset's name. */
  label: string
  /** The most severe issue it would cause, shown by the cursor. */
  issue?: { code: string; message: string }
  /** Where it will go, e.g. "Back to W6" or "On W2 · bottom at 680 mm". */
  hint: string
  /** What it snapped to: a wall is highlighted, a fitting ringed. */
  snap: SnapTarget
}

/** Placing mode: a ghost follows the pointer and a click puts it down. */
export interface PlanPlacing {
  assetId: string
  /** The asset's name. */
  label: string
  ghost: PlanGhost | null
  /** The pointer's plan position (null when it leaves the plan). */
  onMove: (point: Point | null, options: { free: boolean }) => void
  /**
   * Click or drop at `point` (room mm); `repeat` (Shift) keeps placing the
   * same asset, `free` (Alt) skips the grid.
   */
  onPlace: (options: { point: Point; free: boolean; repeat: boolean }) => void
}

export interface PlanViewProps {
  room: RoomGeometry
  placements: readonly Placement[]
  /** Asset specs by asset id. */
  assets: Readonly<Record<string, AssetSpec>>
  lint?: LintReport
  theme: "light" | "dark"
  viewport: PlanViewport
  onViewportChange: (viewport: PlanViewport) => void
  selectedId?: string | null
  /** Items to wash in `highlightSeverity`'s colour (an issue's items). */
  highlightIds?: readonly string[]
  highlightSeverity?: LintSeverity
  /** Items to outline as hovered (from the inspector). */
  hoverIds?: readonly string[]
  editable?: boolean
  onHover?: (id: string | null) => void
  onSelect?: (id: string | null) => void
  /** Live drag preview (null when a drag ends or is cancelled). */
  onDrag?: (drag: PlanDrag | null) => void
  /** A finished drag: the item's new centre, snapped. */
  onDrop?: (drag: PlanDrag) => void
  onKeyAction?: (action: PlanKeyAction) => void
  /** When set, the plan is placing a new item instead of editing. */
  placing?: PlanPlacing | null
  className?: string
}

const VIEWBOX = /viewBox="([^"]+)"/

type Gesture =
  | {
      kind: "item"
      id: string
      pointerId: number
      client: readonly [number, number]
      start: DragStart
      dragging: boolean
      last: PlanDrag | null
    }
  | {
      kind: "pan"
      pointerId: number
      client: readonly [number, number]
      viewport: PlanViewport
    }

/**
 * The floor plan, editable. Draws core's `planSvg` (the same drawing the
 * agent sees) and lays a transparent hit layer over it in the same room-mm
 * coordinates: hover and click select items, dragging moves them (10mm grid,
 * Alt for free placement), and with an item selected the keyboard nudges,
 * turns and removes it. Empty space pans; ⌃/pinch-scroll zooms.
 *
 * In placing mode a ghost of the new item follows the pointer (or an asset
 * dragged in from the picker), tinted by what lint would say, and a click
 * or drop puts it down.
 *
 * The drawing's frame is fixed per room (the empty room's viewBox), so items
 * dragged beyond the walls don't rescale the plan under the pointer.
 */
export function PlanView({
  room,
  placements,
  assets,
  lint,
  theme,
  viewport,
  onViewportChange,
  selectedId,
  highlightIds = [],
  highlightSeverity = "error",
  hoverIds = [],
  editable = true,
  onHover,
  onSelect,
  onDrag,
  onDrop,
  onKeyAction,
  placing = null,
  className,
}: PlanViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const frame = useRef<number | null>(null)
  const hovered = useRef<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [cursor, setCursor] = useState<{
    x: number
    y: number
    width: number
  } | null>(null)
  const pendingMove = useRef<{ point: Point; free: boolean } | null>(null)

  const palette = useMemo(() => planTheme(theme), [theme])
  // The empty room's frame: stable while items move.
  const viewBox = useMemo(
    () =>
      VIEWBOX.exec(planSvg({ room, options: { theme: palette } }))?.[1] ??
      "0 0 1000 1000",
    [room, palette]
  )
  const markup = useMemo(
    () =>
      planSvg({
        room,
        placements,
        assets,
        lint,
        options: {
          theme: palette,
          highlight: [...highlightIds, ...(selectedId ? [selectedId] : [])],
        },
      }).replace(VIEWBOX, `viewBox="${viewBox}"`),
    [room, placements, assets, lint, highlightIds, selectedId, palette, viewBox]
  )

  const footprints = useMemo(
    () => planFootprints(placements, assets),
    [placements, assets]
  )
  // Ceiling items under floor items, so a pendant never steals the table.
  const hitOrder = useMemo(
    () => [...footprints].sort((a, b) => hitRank(a.mount) - hitRank(b.mount)),
    [footprints]
  )

  // Native, non-passive wheel listener: ⌃/pinch zooms about the cursor,
  // plain scroll pans. (React's onWheel is passive, so it can't stop the
  // browser zooming the page.)
  const viewportRef = useRef(viewport)
  useEffect(() => {
    viewportRef.current = viewport
  })
  const onViewportChangeRef = useRef(onViewportChange)
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange
  })
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const current = viewportRef.current
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect()
        const focus: [number, number] = [
          event.clientX - rect.left - rect.width / 2,
          event.clientY - rect.top - rect.height / 2,
        ]
        onViewportChangeRef.current(
          zoomAt(current, Math.exp(-event.deltaY * 0.01), focus)
        )
      } else {
        onViewportChangeRef.current(
          panBy(current, -event.deltaX, -event.deltaY)
        )
      }
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    []
  )

  const planPoint = (clientX: number, clientY: number) => {
    const ctm = overlayRef.current?.getScreenCTM()
    if (!ctm) return null
    return toPlanPoint(ctm.inverse(), clientX, clientY)
  }

  const setHover = (id: string | null) => {
    if (hovered.current === id) return
    hovered.current = id
    onHover?.(id)
  }

  const idAt = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null
    return target.closest("[data-hit-id]")?.getAttribute("data-hit-id") ?? null
  }

  const scheduleDrag = () => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const current = gesture.current
      if (current?.kind === "item" && current.last) onDrag?.(current.last)
    })
  }

  const endGesture = (commit: boolean) => {
    const current = gesture.current
    gesture.current = null
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    if (current?.kind !== "item" || !current.dragging) return
    setDragging(null)
    if (commit && current.last) onDrop?.(current.last)
    onDrag?.(null)
  }

  // Placing: report the pointer's plan position once per animation frame.
  const movePlacing = (
    clientX: number,
    clientY: number,
    free: boolean
  ): void => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setCursor({
        x: clientX - rect.left,
        y: clientY - rect.top,
        width: rect.width,
      })
    }
    const point = planPoint(clientX, clientY)
    if (!point || !placing) return
    pendingMove.current = { point, free }
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const next = pendingMove.current
      if (next) placing.onMove(next.point, { free: next.free })
    })
  }

  const leavePlacing = () => {
    pendingMove.current = null
    setCursor(null)
    placing?.onMove(null, { free: false })
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    containerRef.current?.focus({ preventScroll: true })
    if (placing) {
      const point = planPoint(event.clientX, event.clientY)
      if (point) {
        placing.onPlace({ point, free: event.altKey, repeat: event.shiftKey })
      }
      return
    }
    const id = idAt(event.target)
    const placement = id ? placements.find((p) => p.id === id) : undefined
    event.currentTarget.setPointerCapture(event.pointerId)
    if (placement) {
      onSelect?.(placement.id)
      const grab = planPoint(event.clientX, event.clientY)
      if (!grab || !editable) return
      gesture.current = {
        kind: "item",
        id: placement.id,
        pointerId: event.pointerId,
        client: [event.clientX, event.clientY],
        start: { origin: [placement.x, placement.z], grab },
        dragging: false,
        last: null,
      }
    } else {
      onSelect?.(null)
      gesture.current = {
        kind: "pan",
        pointerId: event.pointerId,
        client: [event.clientX, event.clientY],
        viewport,
      }
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (placing) {
      movePlacing(event.clientX, event.clientY, event.altKey)
      return
    }
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) {
      setHover(idAt(event.target))
      return
    }
    const dx = event.clientX - current.client[0]
    const dy = event.clientY - current.client[1]
    if (current.kind === "pan") {
      onViewportChange(panBy(current.viewport, dx, dy))
      return
    }
    if (!current.dragging) {
      if (!exceedsDragThreshold(dx, dy)) return
      current.dragging = true
      setDragging(current.id)
    }
    const pointer = planPoint(event.clientX, event.clientY)
    if (!pointer) return
    const [x, z] = dragTarget(current.start, pointer, { free: event.altKey })
    if (current.last && current.last.x === x && current.last.z === z) return
    current.last = { id: current.id, x, z }
    scheduleDrag()
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return
    endGesture(true)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // While placing, the workspace owns R / Shift+R / Esc.
    if (placing) return
    if (event.key === "Escape" && gesture.current?.kind === "item") {
      event.preventDefault()
      endGesture(false)
      return
    }
    if (!selectedId) return
    const action = planKeyAction(event, selectedId)
    if (!action) return
    event.preventDefault()
    onKeyAction?.(action)
  }

  const highlighted = new Set(highlightIds)
  const hoverSet = new Set(hoverIds)
  const severityClass =
    highlightSeverity === "error"
      ? "fill-error-fill/15 stroke-error-fill"
      : highlightSeverity === "warning"
        ? "fill-warning-fill/15 stroke-warning-fill"
        : "fill-info-fill/15 stroke-info-fill"

  return (
    <div
      ref={containerRef}
      data-slot="plan-view"
      data-dragging={dragging ?? undefined}
      data-placing={placing?.assetId}
      role="application"
      aria-label="Floor plan. Click an item to select it, drag to move it; arrows nudge, R turns, Delete removes, Escape deselects."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => endGesture(false)}
      onPointerLeave={() => {
        if (placing) leavePlacing()
        else if (!gesture.current) setHover(null)
      }}
      onDragOver={(event) => {
        if (!placing || !event.dataTransfer.types.length) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
        movePlacing(event.clientX, event.clientY, event.altKey)
      }}
      onDragLeave={(event) => {
        if (!placing) return
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        leavePlacing()
      }}
      onDrop={(event) => {
        if (!placing) return
        event.preventDefault()
        const point = planPoint(event.clientX, event.clientY)
        if (point) {
          placing.onPlace({ point, free: event.altKey, repeat: false })
        }
        setCursor(null)
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "relative size-full touch-none overflow-hidden outline-none select-none focus-visible:ring-1 focus-visible:ring-ring/25 focus-visible:ring-inset",
        placing
          ? "cursor-crosshair"
          : dragging
            ? "cursor-grabbing"
            : "cursor-default",
        className
      )}
    >
      <div
        className="absolute inset-0 p-12"
        style={{
          transform: viewportTransform(viewport),
          transformOrigin: "center",
        }}
      >
        <div className="relative size-full">
          <div
            aria-hidden
            data-slot="plan-drawing"
            className="absolute inset-0 [&>svg]:size-full [&>svg]:overflow-visible"
            // planSvg is our own pure renderer; its output is trusted.
            dangerouslySetInnerHTML={{ __html: markup }}
          />
          <svg
            ref={overlayRef}
            data-slot="plan-hit-layer"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            className={cn(
              "absolute inset-0 size-full overflow-visible",
              placing && "[&_[data-hit-id]]:pointer-events-none"
            )}
          >
            {hitOrder.map((f) => {
              const isSelected = f.id === selectedId
              const isHighlighted = highlighted.has(f.id)
              const isHovered = hoverSet.has(f.id)
              return (
                <g
                  key={f.id}
                  data-hit-id={f.id}
                  data-selected={isSelected || undefined}
                  data-highlighted={isHighlighted || undefined}
                  data-hovered={isHovered || undefined}
                  className={cn(
                    editable && f.mount !== "ceiling" && "cursor-grab",
                    dragging === f.id && "cursor-grabbing"
                  )}
                >
                  <polygon
                    points={svgPoints(f.outline)}
                    fill="transparent"
                    className={cn(
                      "transition-[fill,stroke] duration-150",
                      isHighlighted && severityClass,
                      isHovered && !isSelected && "stroke-ink-soft",
                      isSelected && "fill-clay-fill/12 stroke-clay-fill"
                    )}
                    stroke={
                      isSelected || isHighlighted || isHovered
                        ? undefined
                        : "transparent"
                    }
                    strokeWidth={isSelected ? 2 : 1.5}
                    strokeDasharray={
                      isHovered && !isSelected && !isHighlighted
                        ? "4 3"
                        : undefined
                    }
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                </g>
              )
            })}
            {placing?.ghost ? <GhostShape ghost={placing.ghost} /> : null}
          </svg>
        </div>
      </div>
      {placing?.ghost && cursor ? (
        <GhostCaption ghost={placing.ghost} cursor={cursor} />
      ) : null}
    </div>
  )
}

// Sage for a clean spot, then the severities. (Not clay: it reads too close
// to brick at a glance.)
const GHOST_TINT = {
  none: "fill-sage-fill/20 stroke-sage-fill",
  info: "fill-info-fill/20 stroke-info-fill",
  warning: "fill-warning-fill/25 stroke-warning-fill",
  error: "fill-error-fill/25 stroke-error-fill",
} as const

/** The new item's outline, tinted by lint, with its snap indicator. */
function GhostShape({ ghost }: { ghost: PlanGhost }) {
  const snap = ghost.snap
  return (
    <g
      data-slot="plan-ghost"
      data-severity={ghost.severity ?? "none"}
      data-snap={
        snap.kind === "wall"
          ? `wall:${snap.wall.id}`
          : snap.kind === "feature"
            ? `feature:${snap.featureId}`
            : "free"
      }
      className="pointer-events-none"
    >
      {snap.kind === "wall" ? (
        <line
          x1={snap.wall.start[0]}
          y1={snap.wall.start[1]}
          x2={snap.wall.end[0]}
          y2={snap.wall.end[1]}
          className="stroke-clay-fill"
          strokeOpacity={0.55}
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {snap.kind === "feature" ? (
        <circle
          cx={snap.at[0]}
          cy={snap.at[1]}
          r={160}
          fill="none"
          className="stroke-clay-fill"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {ghost.outline.map((ring, i) => (
        <polygon
          key={i}
          points={svgPoints(ring)}
          className={GHOST_TINT[ghost.severity ?? "none"]}
          strokeWidth={1.5}
          strokeDasharray="5 3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

/** A small caption by the cursor: the item, and the worst issue it'd cause. */
function GhostCaption({
  ghost,
  cursor,
}: {
  ghost: PlanGhost
  cursor: { x: number; y: number; width: number }
}) {
  const flip = cursor.x > cursor.width - 300
  return (
    <div
      data-slot="plan-ghost-caption"
      className="pointer-events-none absolute z-10 flex max-w-72 flex-col gap-0.5 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-float"
      style={{
        left: cursor.x + (flip ? -16 : 16),
        top: cursor.y + 18,
        transform: flip ? "translateX(-100%)" : undefined,
      }}
    >
      <span className="truncate font-medium text-foreground">
        {ghost.label}
      </span>
      <span className="text-2xs text-muted-foreground">{ghost.hint}</span>
      {ghost.issue && ghost.severity ? (
        <span className="flex items-start gap-1.5 pt-0.5 text-2xs leading-snug text-ink-soft">
          <span className="flex h-4 items-center">
            <SeverityIcon severity={ghost.severity} size={8} label={false} />
          </span>
          <span className="line-clamp-2">
            <span className="font-mono text-muted-foreground">
              {ghost.issue.code}
            </span>{" "}
            {ghost.issue.message}
          </span>
        </span>
      ) : null}
    </div>
  )
}

function hitRank(mount: AssetSpec["mount"]): number {
  return mount === "ceiling" ? 0 : mount === "floor-covering" ? 1 : 2
}
