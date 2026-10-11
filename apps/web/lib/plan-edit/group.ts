import type { Point } from "@roomer/core/geometry"
import type { LayoutOp, Placement } from "@roomer/core/schema"

import { restoreOp } from "./optimistic"
import { snapMm } from "./snap"

// Working with several placements at once on the plan: the selection (a
// `Record<string, true>`, per the conventions — not a Set), the marquee,
// group moves, turns and removals as single batches of layout ops.
//
// Only relative and @roomer/core imports here: the e2e suite imports this
// module to check group turns against the same maths.

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export type Selection = Readonly<Record<string, true>>

export const EMPTY_SELECTION: Selection = {}

export function selectionOf(ids: Iterable<string>): Selection {
  const selection: Record<string, true> = {}
  for (const id of ids) selection[id] = true
  return selection
}

/** The selected ids that still exist, in layout order. */
export function selectedIds(
  selection: Selection,
  placements: readonly Pick<Placement, "id">[]
): string[] {
  return placements.filter((p) => selection[p.id]).map((p) => p.id)
}

/** Shift+click: add the item, or take it out if it was in. */
export function toggleSelected(selection: Selection, id: string): Selection {
  if (!selection[id]) return { ...selection, [id]: true }
  const next: Record<string, true> = { ...selection }
  delete next[id]
  return next
}

export function addToSelection(
  selection: Selection,
  ids: Iterable<string>
): Selection {
  return { ...selection, ...selectionOf(ids) }
}

export function selectAll(
  placements: readonly Pick<Placement, "id">[]
): Selection {
  return selectionOf(placements.map((p) => p.id))
}

// ---------------------------------------------------------------------------
// Marquee
// ---------------------------------------------------------------------------

/** An axis-aligned rectangle on the plan, room mm. */
export interface PlanRect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** The rectangle spanned by two corners, whichever way it was dragged. */
export function rectFrom(a: Point, b: Point): PlanRect {
  return {
    minX: Math.min(a[0], b[0]),
    minZ: Math.min(a[1], b[1]),
    maxX: Math.max(a[0], b[0]),
    maxZ: Math.max(a[1], b[1]),
  }
}

function project(points: readonly Point[], axis: Point): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const [x, z] of points) {
    const d = x * axis[0] + z * axis[1]
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

/**
 * Whether a convex polygon (an item's plan outline) and a rectangle
 * overlap, touching included: the separating-axis test on the rectangle's
 * axes and the polygon's edge normals.
 */
export function polygonIntersectsRect(
  polygon: readonly Point[],
  rect: PlanRect
): boolean {
  if (polygon.length === 0) return false
  const corners: Point[] = [
    [rect.minX, rect.minZ],
    [rect.maxX, rect.minZ],
    [rect.maxX, rect.maxZ],
    [rect.minX, rect.maxZ],
  ]
  const axes: Point[] = [
    [1, 0],
    [0, 1],
  ]
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const edge: Point = [b[0] - a[0], b[1] - a[1]]
    if (edge[0] !== 0 || edge[1] !== 0) axes.push([-edge[1], edge[0]])
  }
  return axes.every((axis) => {
    const [pMin, pMax] = project(polygon, axis)
    const [rMin, rMax] = project(corners, axis)
    return pMax >= rMin && rMax >= pMin
  })
}

/** Ids of the items whose outline meets the rectangle. */
export function idsInRect(
  footprints: readonly { id: string; outline: readonly Point[] }[],
  rect: PlanRect
): string[] {
  return footprints
    .filter((f) => polygonIntersectsRect(f.outline, rect))
    .map((f) => f.id)
}

// ---------------------------------------------------------------------------
// Moving a group
// ---------------------------------------------------------------------------

/**
 * A group drag's offset on the 10mm grid (Alt: whole mm). The delta snaps,
 * not each item's centre, so the group keeps its internal spacing exactly.
 */
export function snapDelta(
  dx: number,
  dz: number,
  { free = false }: { free?: boolean } = {}
): [number, number] {
  const grid = free ? 1 : 10
  return [snapMm(dx, grid), snapMm(dz, grid)]
}

/** Placements with the given ones shifted (the group-drag preview). */
export function withOffsets<P extends Placement>(
  placements: readonly P[],
  ids: readonly string[],
  dx: number,
  dz: number
): P[] {
  if (dx === 0 && dz === 0) return [...placements]
  const moving = new Set(ids)
  return placements.map((p) =>
    moving.has(p.id) ? { ...p, x: p.x + dx, z: p.z + dz } : p
  )
}

/** One `nudge` per item by the same offset (none for a zero offset). */
export function groupNudgeOps(
  ids: readonly string[],
  dx: number,
  dz: number
): LayoutOp[] {
  if (dx === 0 && dz === 0) return []
  return ids.map((id) => ({
    op: "nudge",
    id,
    ...(dx !== 0 ? { dx } : {}),
    ...(dz !== 0 ? { dz } : {}),
  }))
}

/** The rectangle around several outlines (null for none). */
export function groupBounds(
  outlines: readonly (readonly Point[])[]
): PlanRect | null {
  const points = outlines.flat()
  if (points.length === 0) return null
  return {
    minX: Math.min(...points.map(([x]) => x)),
    minZ: Math.min(...points.map(([, z]) => z)),
    maxX: Math.max(...points.map(([x]) => x)),
    maxZ: Math.max(...points.map(([, z]) => z)),
  }
}

export function rectCentre(rect: PlanRect): Point {
  return [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2]
}

/**
 * Turning a group `degrees` clockwise (as seen on the plan) about `centre`:
 * each item's centre swings around the point and its facing turns by the
 * same angle; elevation is untouched (wall items stay at their height).
 * Centres round to whole mm.
 */
export function rotateGroup(
  placements: readonly Pick<Placement, "id" | "x" | "z" | "facing">[],
  centre: Point,
  degrees: number
): { id: string; x: number; z: number; facing: number }[] {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return placements.map((p) => {
    const dx = p.x - centre[0]
    const dz = p.z - centre[1]
    // z points down the page, so this matrix turns clockwise on screen.
    const x = centre[0] + dx * cos - dz * sin
    const z = centre[1] + dx * sin + dz * cos
    const facing = (((p.facing + degrees) % 360) + 360) % 360
    return {
      id: p.id,
      x: Math.round(x) || 0,
      z: Math.round(z) || 0,
      facing: Math.round(facing * 100) / 100,
    }
  })
}

/**
 * The batch that turns a group: one `nudge` per item carrying the centre's
 * shift and the turn (core turns each item about its own centre, so shift +
 * turn lands exactly on `rotateGroup`'s result).
 */
export function groupRotateOps(
  placements: readonly Pick<Placement, "id" | "x" | "z" | "facing">[],
  centre: Point,
  degrees: number
): LayoutOp[] {
  const turned = rotateGroup(placements, centre, degrees)
  return turned.map((next, i) => {
    const before = placements[i]!
    const dx = next.x - before.x
    const dz = next.z - before.z
    return {
      op: "nudge",
      id: next.id,
      ...(dx !== 0 ? { dx } : {}),
      ...(dz !== 0 ? { dz } : {}),
      rotate: degrees,
    }
  })
}

export function removeOps(ids: readonly string[]): LayoutOp[] {
  return ids.map((id) => ({ op: "remove", id }))
}

/** The batch that puts removed items back exactly where they were. */
export function restoreOps(placements: readonly Placement[]): LayoutOp[] {
  return placements.map(restoreOp)
}
