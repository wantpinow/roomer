import {
  area,
  convexHull,
  formatNumber,
  signedArea,
  type Point,
} from "@roomer/core/geometry"
import { worldShapes } from "@roomer/core/placement"
import type { AssetSpec, LayoutOp, Mount, Placement } from "@roomer/core/schema"

// Raising and lowering items from the planner: which items can move, the
// batches that move them (core's `nudge dy` and `set elevation`), the
// surfaces an item could rest on, and the readouts.
//
// A placement's elevation is the height of its bottom above the floor. A
// group moves as one piece: lowering stops when its lowest item reaches the
// floor, so items keep their heights relative to each other (a lamp stays
// on its sideboard). Ceiling items never move: their drop is part of the
// asset.
//
// Only relative and @roomer/core imports here (the e2e suite may import it).

/** Alt+↑/↓ and the inspector's steppers raise or lower this much… */
export const LIFT_MM = 10
/** …or this much with Shift. */
export const LIFT_LARGE_MM = 100
/** How far above an item's bottom a surface may be and still be offered. */
export const SUPPORT_REACH_MM = 300
/** Share of an item's base that must be over a surface (lint's W105). */
export const SUPPORT_SHARE = 0.5
/** Heights within this count as touching (lint's `supportToleranceMm`). */
export const SUPPORT_TOLERANCE_MM = 10

/** How an item's height is described: off the floor, on a wall, or fixed. */
export type HeightKind = "floor" | "wall" | "ceiling"

export function heightKind(mount: Mount): HeightKind {
  return mount === "wall" ? "wall" : mount === "ceiling" ? "ceiling" : "floor"
}

type Lift = Pick<Placement, "id" | "elevation">

/**
 * The step a group can take: up as asked; down at most as far as its
 * lowest item is off the floor (0 when it's already there).
 */
export function clampLift(
  placements: readonly Pick<Placement, "elevation">[],
  dy: number
): number {
  if (placements.length === 0) return 0
  if (dy >= 0) return dy
  const lowest = Math.min(...placements.map((p) => p.elevation))
  return Math.max(dy, -lowest) || 0
}

/**
 * One `nudge dy` per item, by the clamped step (none when nothing can
 * move, so the server never sees a BELOW_FLOOR).
 */
export function liftOps(placements: readonly Lift[], dy: number): LayoutOp[] {
  const step = clampLift(placements, dy)
  if (step === 0) return []
  return placements.map((p) => ({ op: "nudge", id: p.id, dy: step }))
}

/** `set elevation` for every item not already there (whole mm, ≥ 0). */
export function setElevationOps(
  placements: readonly Lift[],
  elevation: number
): LayoutOp[] {
  const value = Math.max(0, Math.round(elevation))
  return placements
    .filter((p) => p.elevation !== value)
    .map((p) => ({ op: "set", id: p.id, elevation: value }))
}

/** Placements with the given ones at one elevation (the typing preview). */
export function withElevation<P extends Placement>(
  placements: readonly P[],
  ids: readonly string[],
  elevation: number
): P[] {
  const moving = new Set(ids)
  const value = Math.max(0, Math.round(elevation))
  return placements.map((p) =>
    moving.has(p.id) && p.elevation !== value ? { ...p, elevation: value } : p
  )
}

/** The items' common elevation, "mixed", or null for none. */
export function sharedElevation(
  placements: readonly Pick<Placement, "elevation">[]
): number | "mixed" | null {
  const [first, ...rest] = placements
  if (!first) return null
  return rest.every((p) => p.elevation === first.elevation)
    ? first.elevation
    : "mixed"
}

/** The parts' vertical extent with the item at elevation 0 (mm). */
function heightRange(asset: Pick<AssetSpec, "geometry">): [number, number] {
  const shapes = worldShapes({ x: 0, z: 0, facing: 0, elevation: 0 }, asset)
  if (shapes.length === 0) return [0, 0]
  return [
    Math.min(...shapes.map((s) => s.y0)),
    Math.max(...shapes.map((s) => s.y1)),
  ]
}

/** Where a wall item's middle is, above the floor (rounded mm). */
export function centreHeight(
  placement: Pick<Placement, "elevation">,
  asset: Pick<AssetSpec, "geometry">
): number {
  const [bottom, top] = heightRange(asset)
  return Math.round(placement.elevation + (bottom + top) / 2)
}

// ---------------------------------------------------------------------------
// Surfaces to rest on
// ---------------------------------------------------------------------------

export interface SupportSurface {
  /** The placement it would stand on. */
  id: string
  name: string
  /** The surface's height above the floor, mm. */
  top: number
  /** The elevation that stands the item's base on it. */
  elevation: number
  /** Share of the item's base over it, 0–1. */
  share: number
  /** The item already stands there. */
  current: boolean
}

/** A placed item, its asset and what the UI calls it. */
export interface PlacedThing {
  placement: Placement
  asset: Pick<AssetSpec, "geometry" | "mount">
  name: string
}

/**
 * The tops the item could stand on, highest first: for each other item,
 * the highest part whose top is under at least half of the item's base
 * (lint's W105 measure) and within reach — at most `SUPPORT_REACH_MM`
 * above the item's bottom, or anywhere on an item it's sunk into (a lamp
 * dragged onto a sideboard while still on the floor clashes with the
 * sideboard; its top is where it should go). Rugs and ceiling items aren't
 * surfaces.
 */
export function supportSurfaces(
  item: PlacedThing,
  others: readonly PlacedThing[],
  { reach = SUPPORT_REACH_MM }: { reach?: number } = {}
): SupportSurface[] {
  const shapes = worldShapes(item.placement, item.asset)
  if (shapes.length === 0) return []
  const bottom = Math.min(...shapes.map((s) => s.y0))
  const itemTop = Math.max(...shapes.map((s) => s.y1))
  const offset = bottom - item.placement.elevation
  const base = shapes
    .filter((s) => s.y0 <= bottom + SUPPORT_TOLERANCE_MM)
    .map((s) => s.footprint)
  const baseArea = base.reduce((sum, ring) => sum + area(ring), 0)
  if (baseArea <= 0) return []
  const shareOver = (footprint: readonly Point[]) => {
    const hull = convexHull(footprint)
    return (
      base.reduce((sum, ring) => sum + area(clipToConvex(ring, hull)), 0) /
      baseArea
    )
  }

  const found: SupportSurface[] = []
  for (const other of others) {
    if (other.placement.id === item.placement.id) continue
    if (other.asset.mount === "floor-covering") continue
    if (other.asset.mount === "ceiling") continue
    const parts = worldShapes(other.placement, other.asset).map((part) => ({
      top: part.y1,
      bottom: part.y0,
      share: shareOver(part.footprint),
    }))
    const sunk = parts.some(
      (part) =>
        part.share > 0 &&
        part.bottom < itemTop - SUPPORT_TOLERANCE_MM &&
        part.top > bottom + SUPPORT_TOLERANCE_MM
    )
    let best: { top: number; share: number } | null = null
    for (const part of parts) {
      if (part.top <= SUPPORT_TOLERANCE_MM) continue
      if (part.share < SUPPORT_SHARE - 1e-9) continue
      if (part.top > bottom + reach && !sunk) continue
      if (best && part.top <= best.top) continue
      best = part
    }
    if (!best) continue
    const elevation = Math.round(best.top - offset)
    if (elevation < 0) continue
    found.push({
      id: other.placement.id,
      name: other.name,
      top: Math.round(best.top),
      elevation,
      share: Math.min(1, best.share),
      current: elevation === item.placement.elevation,
    })
  }
  return found.sort(
    (a, b) => b.top - a.top || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  )
}

/**
 * Clip a polygon to a convex one (Sutherland–Hodgman); [] when they don't
 * overlap. Exact for a convex subject; for a concave one the area is still
 * right.
 */
export function clipToConvex(
  subject: readonly Point[],
  clip: readonly Point[]
): Point[] {
  if (subject.length < 3 || clip.length < 3) return []
  // Inside is to the left of each edge for a positive shoelace area.
  const sign = Math.sign(signedArea(clip)) || 1
  const side = (a: Point, b: Point, p: Point) =>
    sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
  let output: Point[] = [...subject]
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i]!
    const b = clip[(i + 1) % clip.length]!
    const input = output
    output = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!
      const q = input[(j + 1) % input.length]!
      const sp = side(a, b, p)
      const sq = side(a, b, q)
      if (sp >= 0) output.push(p)
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq)
        output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
      }
    }
  }
  return output
}

// ---------------------------------------------------------------------------
// The selection's height, for the inspector
// ---------------------------------------------------------------------------

export interface HeightSelection {
  /** "ceiling" when every selected item hangs from it (nothing to change). */
  kind: HeightKind
  /** The items whose height changes: every selected one not on the ceiling. */
  ids: string[]
  /** Their bottom's height, or "mixed". */
  value: number | "mixed"
  /** For "mixed": the lowest and highest bottom. */
  range?: readonly [number, number]
  /** One wall item: the height of its middle. */
  centre?: number
  /** False when the lowest of them is on the floor already. */
  canLower: boolean
  /** Floor items that are off the floor ("On the floor" puts them down). */
  raised: string[]
}

export function heightSelection(
  selected: readonly Pick<PlacedThing, "placement" | "asset">[]
): HeightSelection | null {
  if (selected.length === 0) return null
  const movable = selected.filter(
    (s) => heightKind(s.asset.mount) !== "ceiling"
  )
  if (movable.length === 0) {
    return {
      kind: "ceiling",
      ids: [],
      value: sharedElevation(selected.map((s) => s.placement)) ?? 0,
      canLower: false,
      raised: [],
    }
  }
  const placements = movable.map((s) => s.placement)
  const allWall = movable.every((s) => s.asset.mount === "wall")
  const only = movable.length === 1 ? movable[0] : undefined
  const value = sharedElevation(placements) ?? 0
  const heights = placements.map((p) => p.elevation)
  return {
    kind: allWall ? "wall" : "floor",
    ids: placements.map((p) => p.id),
    value,
    ...(value === "mixed"
      ? { range: [Math.min(...heights), Math.max(...heights)] as const }
      : {}),
    ...(only && allWall
      ? { centre: centreHeight(only.placement, only.asset) }
      : {}),
    canLower: clampLift(placements, -1) !== 0,
    raised: movable
      .filter((s) => s.asset.mount !== "wall" && s.placement.elevation > 0)
      .map((s) => s.placement.id),
  }
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

/** The plan's height badge: 800 → "↑ 800" (null on the floor). */
export function elevationBadge(elevation: number): string | null {
  return elevation > 0 ? `↑ ${formatNumber(elevation)}` : null
}

/**
 * What the caption says about a height: "on the floor", "760 mm off the
 * floor", "bottom 1,100 mm · centre 1,520 mm" on a wall, "0–820 mm off the
 * floor" for a group at several heights.
 */
export function describeHeight(
  height: Pick<HeightSelection, "value" | "kind" | "centre" | "range">
): string {
  const { value, kind, centre, range } = height
  if (value === "mixed") {
    if (!range) return "mixed heights"
    const span = `${formatNumber(range[0])}–${formatNumber(range[1])} mm`
    return kind === "wall" ? `bottoms ${span}` : `${span} off the floor`
  }
  if (kind === "wall") {
    return centre === undefined
      ? `bottom ${formatNumber(value)} mm`
      : `bottom ${formatNumber(value)} mm · centre ${formatNumber(centre)} mm`
  }
  if (kind === "ceiling") return "hangs from the ceiling"
  return value === 0
    ? "on the floor"
    : `${formatNumber(value)} mm off the floor`
}

/** "Rest on Sideboard (750 mm)". */
export function restLabel(surface: Pick<SupportSurface, "name" | "top">) {
  return `Rest on ${surface.name} (${formatNumber(surface.top)} mm)`
}

/** A typed height: whole, non-negative mm, or null when it isn't one. */
export function parseHeight(text: string): number | null {
  const cleaned = text.replace(/[,\s]|mm$/gi, "")
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  return Math.round(Number(cleaned))
}
