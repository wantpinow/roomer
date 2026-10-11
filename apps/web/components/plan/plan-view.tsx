"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { RoomGeometry } from "@roomer/core/geometry"
import { planSvg, type PlanSvgOptions } from "@roomer/core/plan"
import type {
  AssetSpec,
  LintReport,
  LintSeverity,
  Placement,
} from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

import { designTokens } from "@/lib/design-tokens"
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
import { planFootprints, svgPoints } from "@/lib/workspace/footprints"

import { FootprintSketch, roomViewBox, RoomShellSketch } from "./room-outline"

export interface PlanDrag {
  id: string
  x: number
  z: number
}

export interface PlanViewProps {
  room: RoomGeometry
  placements: readonly Placement[]
  /** Asset specs by asset id. */
  assets: Readonly<Record<string, AssetSpec>>
  lint?: LintReport
  /** Display names by placement id (for the interim sketch's labels). */
  labels?: Readonly<Record<string, string>>
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
  className?: string
}

const STUB_VIEWBOX = "0 0 1 1"

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
 * While core's renderer is still a stub, the hit layer draws a plain sketch
 * of the room and furniture itself so the plan stays usable.
 */
export function PlanView({
  room,
  placements,
  assets,
  lint,
  labels = {},
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
  className,
}: PlanViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const frame = useRef<number | null>(null)
  const hovered = useRef<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const markup = useMemo(() => {
    const options: PlanSvgOptions & { theme: unknown } = {
      showDimensions: true,
      showLabels: true,
      highlight: [...highlightIds, ...(selectedId ? [selectedId] : [])],
      // planSvg's palette (accepted once core's PlanTheme lands).
      theme: designTokens.plan[theme],
    }
    return planSvg({ room, placements, assets, lint, options })
  }, [room, placements, assets, lint, highlightIds, selectedId, theme])

  const viewBoxMatch = /viewBox="([^"]+)"/.exec(markup)
  const stub = !viewBoxMatch || viewBoxMatch[1] === STUB_VIEWBOX
  const viewBox = stub ? roomViewBox(room.corners, 600) : viewBoxMatch[1]!

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

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    containerRef.current?.focus({ preventScroll: true })
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
      data-plan-renderer={stub ? "sketch" : "core"}
      role="application"
      aria-label="Floor plan. Click an item to select it, drag to move it; arrows nudge, R turns, Delete removes, Escape deselects."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => endGesture(false)}
      onPointerLeave={() => {
        if (!gesture.current) setHover(null)
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "relative size-full touch-none overflow-hidden outline-none select-none focus-visible:ring-1 focus-visible:ring-ring/25 focus-visible:ring-inset",
        dragging ? "cursor-grabbing" : "cursor-default",
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
          {stub ? null : (
            <div
              aria-hidden
              className="absolute inset-0 [&>svg]:size-full"
              // planSvg is our own pure renderer; its output is trusted.
              dangerouslySetInnerHTML={{ __html: markup }}
            />
          )}
          <svg
            ref={overlayRef}
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 size-full overflow-visible"
          >
            {stub ? (
              <>
                <RoomShellSketch
                  corners={room.corners}
                  features={room.features}
                />
                <FootprintSketch footprints={footprints} />
              </>
            ) : null}
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
                  {stub &&
                  f.mount !== "ceiling" &&
                  f.mount !== "floor-covering" ? (
                    <PlanLabel
                      outline={f.outline}
                      text={labels[f.id] ?? f.id}
                    />
                  ) : null}
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}

function hitRank(mount: AssetSpec["mount"]): number {
  return mount === "ceiling" ? 0 : mount === "floor-covering" ? 1 : 2
}

/**
 * A label centred in an item, along its longer side, sized to the plan and
 * skipped if it won't fit.
 */
function PlanLabel({
  outline,
  text,
}: {
  outline: readonly (readonly [number, number])[]
  text: string
}) {
  const xs = outline.map(([x]) => x)
  const zs = outline.map(([, z]) => z)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...zs) - Math.min(...zs)
  const vertical = height > width * 1.3
  const along = vertical ? height : width
  const across = vertical ? width : height
  const size = Math.min(130, across * 0.3)
  if (along < 380 || size < 60) return null
  const maxChars = Math.floor((along * 0.85) / (size * 0.55))
  const shown =
    text.length > maxChars
      ? `${text.slice(0, Math.max(1, maxChars - 1))}…`
      : text
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  return (
    <text
      x={cx}
      y={cz}
      transform={vertical ? `rotate(-90 ${cx} ${cz})` : undefined}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      className="pointer-events-none fill-ink-soft font-sans"
    >
      {shown}
    </text>
  )
}
