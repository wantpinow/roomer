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
import { elevationBadge } from "@/lib/plan-edit/elevation"
import {
  groupBounds,
  idsInRect,
  rectFrom,
  snapDelta,
  type PlanRect,
} from "@/lib/plan-edit/group"
import { planKeyAction, type PlanKeyAction } from "@/lib/plan-edit/keyboard"
import type { SnapTarget } from "@/lib/plan-edit/placing"
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

/**
 * A drag in progress or just finished: the items moving and their offset
 * (mm). One item snaps its centre to the grid; a group snaps the offset.
 */
export interface PlanDrag {
  ids: readonly string[]
  dx: number
  dz: number
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

/**
 * A caption pinned beside some items on the plan — while their height
 * changes: what they are, how high, and the worst issue it causes.
 */
export interface PlanCaption {
  ids: readonly string[]
  title: string
  detail: string
  issue?: { code: string; message: string; severity: LintSeverity }
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
  /** The selection, in layout order. */
  selectedIds?: readonly string[]
  /** Items to wash in `highlightSeverity`'s colour (an issue's items). */
  highlightIds?: readonly string[]
  highlightSeverity?: LintSeverity
  /** Items to outline as hovered (from the inspector). */
  hoverIds?: readonly string[]
  editable?: boolean
  onHover?: (id: string | null) => void
  /** A click: on an item (or null for empty floor); `toggle` with Shift. */
  onSelect?: (id: string | null, options: { toggle: boolean }) => void
  /** A marquee: the items it touched; `add` (Shift) extends the selection. */
  onMarquee?: (ids: string[], options: { add: boolean }) => void
  /** Live drag preview (null when a drag ends or is cancelled). */
  onDrag?: (drag: PlanDrag | null) => void
  /** A finished drag. */
  onDrop?: (drag: PlanDrag) => void
  onKeyAction?: (action: PlanKeyAction) => void
  /** When set, the plan is placing a new item instead of editing. */
  placing?: PlanPlacing | null
  /** Pinned beside its items (see `PlanCaption`). */
  caption?: PlanCaption | null
  className?: string
}

const VIEWBOX = /viewBox="([^"]+)"/
/** A press that travels less than this (px) is a click. */
const CLICK_SLOP_PX = 4

type Gesture =
  | {
      kind: "move"
      /** The items moving: one, or the whole selection. */
      ids: readonly string[]
      /** The item pressed (for a single item, its centre snaps). */
      anchor: string
      pointerId: number
      client: readonly [number, number]
      start: DragStart
      dragging: boolean
      last: PlanDrag | null
      /** Collapse a multi-selection to the pressed item if it's a click. */
      collapseOnClick: boolean
    }
  | {
      kind: "marquee"
      pointerId: number
      client: readonly [number, number]
      start: Point
      add: boolean
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
 * coordinates:
 * - click selects an item (Shift+click toggles it), click on the floor
 *   clears; drag on the floor draws a marquee that selects what it touches
 *   (Shift adds);
 * - dragging an item moves it (its centre on the 10mm grid; Alt for free);
 *   dragging any item of a multi-selection moves the whole group by one
 *   snapped offset;
 * - with a selection, the keyboard nudges, raises/lowers (Alt+↑/↓), turns
 *   and removes it (⌘A selects all, Esc clears);
 * - raised items carry a small "↑ 800" badge, and a caption can be pinned
 *   beside items (their height while it changes, and the worst issue);
 * - Space+drag or middle-drag pans; scroll pans; ⌃/pinch-scroll zooms.
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
  selectedIds = [],
  highlightIds = [],
  highlightSeverity = "error",
  hoverIds = [],
  editable = true,
  onHover,
  onSelect,
  onMarquee,
  onDrag,
  onDrop,
  onKeyAction,
  placing = null,
  caption = null,
  className,
}: PlanViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const frame = useRef<number | null>(null)
  const hovered = useRef<string | null>(null)
  const space = useRef(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<PlanRect | null>(null)
  const [panning, setPanning] = useState(false)
  const [cursor, setCursor] = useState<{
    x: number
    y: number
    width: number
  } | null>(null)
  /** Screen px per plan mm at zoom 1 (for the group chip's size). */
  const [fit, setFit] = useState(0)
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
          highlight: [...highlightIds, ...selectedIds],
        },
      }).replace(VIEWBOX, `viewBox="${viewBox}"`),
    [
      room,
      placements,
      assets,
      lint,
      highlightIds,
      selectedIds,
      palette,
      viewBox,
    ]
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

  // How big a plan millimetre is on screen at zoom 1, kept up to date as
  // the stage resizes (the overlay "meets" its viewBox).
  useEffect(() => {
    const svg = overlayRef.current
    if (!svg) return
    const [, , width = 1, height = 1] = viewBox.split(/\s+/).map(Number)
    const measure = () =>
      setFit(Math.min(svg.clientWidth / width, svg.clientHeight / height))
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [viewBox])

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
      if (current?.kind === "move" && current.last) onDrag?.(current.last)
    })
  }

  const endGesture = (
    commit: boolean,
    event?: { clientX: number; clientY: number }
  ) => {
    const current = gesture.current
    gesture.current = null
    setPanning(false)
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    if (!current) return
    if (current.kind === "marquee") {
      setMarquee(null)
      if (!commit || !event) return
      const moved = Math.hypot(
        event.clientX - current.client[0],
        event.clientY - current.client[1]
      )
      if (moved < CLICK_SLOP_PX) {
        // A click on empty floor clears (Shift+click on it does nothing).
        if (!current.add) onSelect?.(null, { toggle: false })
        return
      }
      const end = planPoint(event.clientX, event.clientY)
      if (!end) return
      onMarquee?.(idsInRect(footprints, rectFrom(current.start, end)), {
        add: current.add,
      })
      return
    }
    if (current.kind !== "move") return
    if (!current.dragging) {
      if (commit && current.collapseOnClick) {
        onSelect?.(current.anchor, { toggle: false })
      }
      return
    }
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

  const selectedSet = new Set(selectedIds)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    containerRef.current?.focus({ preventScroll: true })
    if (placing) {
      if (event.button !== 0) return
      const point = planPoint(event.clientX, event.clientY)
      if (point) {
        placing.onPlace({ point, free: event.altKey, repeat: event.shiftKey })
      }
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const client: [number, number] = [event.clientX, event.clientY]
    if (event.button === 1 || space.current) {
      event.preventDefault()
      setPanning(true)
      gesture.current = {
        kind: "pan",
        pointerId: event.pointerId,
        client,
        viewport,
      }
      return
    }
    const id = idAt(event.target)
    const placement = id ? placements.find((p) => p.id === id) : undefined
    if (!placement) {
      const start = planPoint(event.clientX, event.clientY)
      if (!start) return
      gesture.current = {
        kind: "marquee",
        pointerId: event.pointerId,
        client,
        start,
        add: event.shiftKey,
      }
      return
    }
    if (event.shiftKey) {
      onSelect?.(placement.id, { toggle: true })
      return
    }
    const inGroup = selectedSet.has(placement.id) && selectedSet.size > 1
    if (!inGroup) onSelect?.(placement.id, { toggle: false })
    const grab = planPoint(event.clientX, event.clientY)
    if (!grab || !editable) return
    gesture.current = {
      kind: "move",
      ids: inGroup ? selectedIds : [placement.id],
      anchor: placement.id,
      pointerId: event.pointerId,
      client,
      start: { origin: [placement.x, placement.z], grab },
      dragging: false,
      last: null,
      collapseOnClick: inGroup,
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
    const pointer = planPoint(event.clientX, event.clientY)
    if (!pointer) return
    if (current.kind === "marquee") {
      if (Math.hypot(dx, dy) < CLICK_SLOP_PX) return
      setMarquee(rectFrom(current.start, pointer))
      return
    }
    if (!current.dragging) {
      if (!exceedsDragThreshold(dx, dy)) return
      current.dragging = true
      setDragging(current.anchor)
    }
    const free = event.altKey
    let offset: [number, number]
    if (current.ids.length === 1) {
      // One item: its centre lands on the grid.
      const [x, z] = dragTarget(current.start, pointer, { free })
      offset = [x - current.start.origin[0], z - current.start.origin[1]]
    } else {
      // A group: the offset is on the grid, so spacing is kept exactly.
      offset = snapDelta(
        pointer[0] - current.start.grab[0],
        pointer[1] - current.start.grab[1],
        { free }
      )
    }
    const [ox, oz] = offset
    if (current.last && current.last.dx === ox && current.last.dz === oz) return
    current.last = { ids: current.ids, dx: ox, dz: oz }
    scheduleDrag()
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return
    endGesture(true, event)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") {
      // Space+drag pans; don't scroll the page.
      event.preventDefault()
      space.current = true
      return
    }
    // While placing, the workspace owns R / Shift+R / Esc.
    if (placing) return
    if (event.key === "Escape" && gesture.current) {
      event.preventDefault()
      endGesture(false)
      return
    }
    const action = planKeyAction(event, selectedIds.length)
    if (!action) return
    event.preventDefault()
    onKeyAction?.(action)
  }

  const highlighted = new Set(highlightIds)
  const hoverSet = new Set(hoverIds)
  const underMarquee = new Set(marquee ? idsInRect(footprints, marquee) : [])
  const severityClass =
    highlightSeverity === "error"
      ? "fill-error-fill/15 stroke-error-fill"
      : highlightSeverity === "warning"
        ? "fill-warning-fill/15 stroke-warning-fill"
        : "fill-info-fill/15 stroke-info-fill"

  const group =
    selectedIds.length > 1
      ? groupBounds(
          footprints.filter((f) => selectedSet.has(f.id)).map((f) => f.outline)
        )
      : null
  /** mm per screen pixel right now (0 until measured). */
  const mmPerPx = fit > 0 ? 1 / (fit * viewport.zoom) : 0
  const elevations = new Map(placements.map((p) => [p.id, p.elevation]))
  const captionBounds = caption
    ? groupBounds(
        footprints
          .filter((f) => caption.ids.includes(f.id))
          .map((f) => f.outline)
      )
    : null

  return (
    <div
      ref={containerRef}
      data-slot="plan-view"
      data-dragging={dragging ?? undefined}
      data-placing={placing?.assetId}
      data-selected-count={selectedIds.length || undefined}
      role="application"
      aria-label="Floor plan. Click an item to select it (Shift+click to add), drag on the floor to select several, drag to move; arrows nudge, Alt+Up and Alt+Down raise and lower, R turns, Delete removes, Escape clears. Space+drag pans."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => endGesture(false)}
      onPointerLeave={() => {
        if (placing) leavePlacing()
        else if (!gesture.current) setHover(null)
      }}
      onKeyUp={(event) => {
        if (event.key === " ") space.current = false
      }}
      onBlur={() => {
        space.current = false
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
          : panning
            ? "cursor-grabbing"
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
              const isSelected = selectedSet.has(f.id)
              const isHighlighted = highlighted.has(f.id)
              const isHovered = hoverSet.has(f.id) || underMarquee.has(f.id)
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
            {mmPerPx > 0
              ? footprints.map((f) => {
                  const badge =
                    f.mount === "ceiling"
                      ? null
                      : elevationBadge(elevations.get(f.id) ?? 0)
                  return badge ? (
                    <ElevationBadge
                      key={f.id}
                      id={f.id}
                      label={badge}
                      outline={f.outline}
                      selected={selectedSet.has(f.id)}
                      mmPerPx={mmPerPx}
                    />
                  ) : null
                })
              : null}
            {group && mmPerPx > 0 ? (
              <GroupFrame
                bounds={group}
                count={selectedIds.length}
                mmPerPx={mmPerPx}
              />
            ) : null}
            {marquee ? (
              <rect
                data-slot="plan-marquee"
                x={marquee.minX}
                y={marquee.minZ}
                width={marquee.maxX - marquee.minX}
                height={marquee.maxZ - marquee.minZ}
                className="pointer-events-none fill-clay-fill/10 stroke-ink/80"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {placing?.ghost ? <GhostShape ghost={placing.ghost} /> : null}
            {caption && captionBounds && mmPerPx > 0 ? (
              <ItemCaption
                caption={caption}
                bounds={captionBounds}
                mmPerPx={mmPerPx}
              />
            ) : null}
          </svg>
        </div>
      </div>
      {placing?.ghost && cursor ? (
        <GhostCaption ghost={placing.ghost} cursor={cursor} />
      ) : null}
    </div>
  )
}

function hitRank(mount: AssetSpec["mount"]): number {
  return mount === "ceiling" ? 0 : mount === "floor-covering" ? 1 : 2
}

/**
 * The dashed frame around a multi-selection, with a small "4 selected"
 * chip on its top-left corner — sized in screen pixels whatever the zoom.
 */
function GroupFrame({
  bounds,
  count,
  mmPerPx,
}: {
  bounds: PlanRect
  count: number
  mmPerPx: number
}) {
  const pad = 8 * mmPerPx
  const label = `${count} selected`
  const chipWidth = 14 + label.length * 6.1
  return (
    <g
      data-slot="plan-group"
      data-count={count}
      className="pointer-events-none"
    >
      <rect
        x={bounds.minX - pad}
        y={bounds.minZ - pad}
        width={bounds.maxX - bounds.minX + pad * 2}
        height={bounds.maxZ - bounds.minZ + pad * 2}
        fill="none"
        className="stroke-ink-soft"
        strokeWidth={1}
        strokeDasharray="5 4"
        vectorEffect="non-scaling-stroke"
      />
      <g
        transform={`translate(${bounds.minX - pad} ${bounds.minZ - pad}) scale(${mmPerPx})`}
      >
        <rect
          x={0}
          y={-24}
          width={chipWidth}
          height={18}
          rx={9}
          className="fill-ink"
        />
        <text
          x={chipWidth / 2}
          y={-11.5}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={500}
          className="fill-paper font-sans"
        >
          {label}
        </text>
      </g>
    </g>
  )
}

/**
 * "↑ 800" just above a raised item's top-right corner, so height shows on
 * the plan; sized in screen pixels whatever the zoom.
 */
function ElevationBadge({
  id,
  label,
  outline,
  selected,
  mmPerPx,
}: {
  id: string
  label: string
  outline: readonly Point[]
  selected: boolean
  mmPerPx: number
}) {
  const right = Math.max(...outline.map(([x]) => x))
  const top = Math.min(...outline.map(([, z]) => z))
  const width = 10 + label.length * 5.4
  return (
    <g
      data-slot="plan-elevation"
      data-id={id}
      className="pointer-events-none"
      transform={`translate(${right} ${top}) scale(${mmPerPx})`}
    >
      <rect
        x={-width + 6}
        y={-17}
        width={width}
        height={14}
        rx={3}
        className={
          selected
            ? "fill-clay-tint stroke-clay/40"
            : "fill-popover stroke-rule"
        }
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={-width / 2 + 6}
        y={-6.8}
        textAnchor="middle"
        fontSize={9}
        className={cn(
          "font-mono tabular-nums",
          selected ? "fill-clay" : "fill-ink-soft"
        )}
      >
        {label}
      </text>
    </g>
  )
}

/**
 * The height caption, pinned by the items' top-right corner: the items,
 * how high, and the worst issue (like the placing ghost's caption).
 */
function ItemCaption({
  caption,
  bounds,
  mmPerPx,
}: {
  caption: PlanCaption
  bounds: PlanRect
  mmPerPx: number
}) {
  return (
    <g
      className="pointer-events-none"
      transform={`translate(${bounds.maxX} ${bounds.minZ}) scale(${mmPerPx})`}
    >
      <foreignObject x={16} y={-10} width={300} height={160} overflow="visible">
        <div
          data-slot="plan-item-caption"
          data-severity={caption.issue?.severity ?? "none"}
          className="flex w-fit max-w-72 flex-col gap-0.5 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-float"
        >
          <span className="truncate font-medium text-foreground">
            {caption.title}
          </span>
          <span className="text-2xs text-muted-foreground">
            {caption.detail}
          </span>
          {caption.issue ? (
            <span className="flex items-start gap-1.5 pt-0.5 text-2xs leading-snug text-ink-soft">
              <span className="flex h-4 items-center">
                <SeverityIcon
                  severity={caption.issue.severity}
                  size={8}
                  label={false}
                />
              </span>
              <span className="line-clamp-2">
                <span className="font-mono text-muted-foreground">
                  {caption.issue.code}
                </span>{" "}
                {caption.issue.message}
              </span>
            </span>
          ) : null}
        </div>
      </foreignObject>
    </g>
  )
}

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
