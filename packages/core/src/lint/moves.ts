import { directionOf, type Point } from "../geometry/angles"
import { pointSegmentDistance, rayPolygonHit } from "../geometry/distance"
import { formatMm } from "../geometry/format"
import { containsPoint } from "../geometry/polygon"
import { dot } from "../geometry/vec"
import type { Wall } from "../geometry/walls"
import {
  makeSolid,
  type LintContext,
  type LintItem,
  type Solid,
} from "./context"
import { difference, minWidth, project, translate } from "./polygons"
import { solidOverlap } from "./shared"

// Concrete fix suggestions: the shortest straight move (along the plan axes,
// or the item's own axes when it's turned) that clears a collision, checked
// against the walls, the other items and the doors so the hint doesn't send
// the item straight into something else.

export interface MoveSuggestion {
  item: LintItem
  /** Unit direction on the plan. */
  direction: Point
  /** Whole millimetres. */
  distance: number
  /** What the item would run into after the move, if anything. */
  conflict?: string
}

export interface MoveOptions {
  /** Pairs to clear; default: solids overlapping by more than tolerance. */
  collides?: (part: Solid, fixed: Solid) => boolean
  /** Items to ignore when checking where the move lands. */
  ignore?: ReadonlySet<string>
}

const AXES: Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

function candidateDirections(item: LintItem): Point[] {
  const facing = item.placement.facing
  const quarter = facing / 90
  if (Math.abs(quarter - Math.round(quarter)) < 1e-3) return AXES
  const front = directionOf(facing)
  const right = directionOf(facing + 90)
  return [...AXES, front, [-front[0], -front[1]], right, [-right[0], -right[1]]]
}

/** Point within `tolerance` of the outline counts as inside. */
function insideOutline(
  polygon: readonly Point[],
  point: Point,
  tolerance = 1
): boolean {
  if (containsPoint(polygon, point)) return true
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    if (pointSegmentDistance(point, a, b) <= tolerance) return true
  }
  return false
}

/** How far (minimum width) the footprint pokes out of the room, mm. */
export function outsideDepth(
  ctx: LintContext,
  footprint: readonly Point[]
): number {
  const allInside = footprint.every((p) => insideOutline(ctx.polygon, p))
  const cornerInside = ctx.polygon.some(
    (corner) =>
      containsPoint(footprint, corner) &&
      footprint.every((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1]) > 1)
  )
  if (allInside && !cornerInside) return 0
  let depth = 0
  for (const region of difference(footprint, [ctx.polygon])) {
    depth = Math.max(depth, minWidth(region))
  }
  return depth
}

/** What a set of moved parts would run into, if anything. */
export function conflictFor(
  ctx: LintContext,
  item: LintItem,
  parts: readonly Solid[],
  ignore: ReadonlySet<string> = new Set()
): string | undefined {
  const tolerance = ctx.thresholds.overlapToleranceMm
  for (const part of parts) {
    if (outsideDepth(ctx, part.footprint) > tolerance) return "a wall"
  }
  for (const other of ctx.items) {
    if (other.id === item.id || ignore.has(other.id)) continue
    if (other.covering !== item.covering) continue
    for (const part of parts) {
      if (other.parts.some((p) => solidOverlap(part, p, tolerance))) {
        return other.name
      }
    }
  }
  for (const obstacle of ctx.obstacles) {
    if (item.covering && obstacle.kind === "skirting") continue
    if (parts.some((part) => solidOverlap(part, obstacle.solid, tolerance))) {
      return obstacle.name
    }
  }
  if (!item.covering) {
    for (const door of ctx.doors) {
      for (const swing of door.swingSolids) {
        if (parts.some((part) => solidOverlap(part, swing, tolerance))) {
          return `the swing of ${door.name}`
        }
      }
      if (parts.some((part) => solidOverlap(part, door.doorway, tolerance))) {
        return `the doorway of ${door.name}`
      }
    }
  }
  return undefined
}

function moveParts(item: LintItem, offset: Point): Solid[] {
  return item.parts.map((part) =>
    makeSolid(translate(part.footprint, offset), part.y0, part.y1)
  )
}

/**
 * The shortest straight move of `item` that clears every collision with
 * `fixed`, preferring moves that land somewhere free.
 */
export function suggestMove(
  ctx: LintContext,
  item: LintItem,
  fixed: readonly Solid[],
  options: MoveOptions = {}
): MoveSuggestion | undefined {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const collides =
    options.collides ??
    ((part: Solid, other: Solid) =>
      solidOverlap(part, other, tolerance) !== undefined)
  const pairs: [Solid, Solid][] = []
  for (const part of item.parts) {
    for (const other of fixed) {
      if (collides(part, other)) pairs.push([part, other])
    }
  }
  if (pairs.length === 0) return undefined

  const candidates: MoveSuggestion[] = candidateDirections(item).map(
    (direction) => {
      let needed = 0
      for (const [part, other] of pairs) {
        const [, otherMax] = project(other.footprint, direction)
        const [partMin] = project(part.footprint, direction)
        needed = Math.max(needed, otherMax - partMin)
      }
      const distance = Math.max(1, Math.ceil(needed - 1e-6))
      const offset: Point = [direction[0] * distance, direction[1] * distance]
      const conflict = conflictFor(
        ctx,
        item,
        moveParts(item, offset),
        options.ignore
      )
      return conflict === undefined
        ? { item, direction, distance }
        : { item, direction, distance, conflict }
    }
  )
  candidates.sort(
    (a, b) =>
      Number(a.conflict !== undefined) - Number(b.conflict !== undefined) ||
      a.distance - b.distance
  )
  return candidates[0]
}

/** "dx: 130", "dz: -45", "dx: 92, dz: -92". */
export function nudgeText(direction: Point, distance: number): string {
  const dx = Math.round(direction[0] * distance) || 0
  const dz = Math.round(direction[1] * distance) || 0
  const parts: string[] = []
  if (dx !== 0) parts.push(`dx: ${dx}`)
  if (dz !== 0) parts.push(`dz: ${dz}`)
  return parts.join(", ") || "dx: 0"
}

/** Which wall a move along `direction` heads for: "towards W5". */
export function directionWords(
  ctx: LintContext,
  from: Point,
  direction: Point,
  awayFrom?: Wall
): string {
  if (awayFrom && dot(direction, awayFrom.normal) > 0.9) {
    return `away from ${awayFrom.id}`
  }
  const hit = rayPolygonHit(ctx.polygon, from, direction)
  if (hit) {
    const wall = ctx.walls.find(
      (w) => pointSegmentDistance(hit.point, w.start, w.end) < 1
    )
    if (wall) return `towards ${wall.id}`
  }
  if (Math.abs(direction[0]) > 0.9) return direction[0] > 0 ? "right" : "left"
  return direction[1] > 0 ? "down the plan" : "up the plan"
}

/** "Move Coffee table 130mm towards W5 (nudge coffee-table dz: 130)." */
export function moveText(
  ctx: LintContext,
  suggestion: MoveSuggestion,
  awayFrom?: Wall
): string {
  const { item, direction, distance } = suggestion
  const where = directionWords(
    ctx,
    [item.placement.x, item.placement.z],
    direction,
    awayFrom
  )
  const base = `Move ${item.name} ${formatMm(distance)} ${where} (nudge ${item.id} ${nudgeText(direction, distance)})`
  return suggestion.conflict
    ? `${base}, though it would then touch ${suggestion.conflict}.`
    : `${base}.`
}

/**
 * Best move among several movers, given in order of preference (e.g. the
 * smaller of two colliding items first): a move that lands somewhere free
 * beats one that doesn't, and a later mover wins only if its move is
 * clearly shorter.
 */
export function bestMove(
  candidates: readonly (MoveSuggestion | undefined)[]
): MoveSuggestion | undefined {
  const ranked = candidates
    .map((suggestion, rank) => ({ suggestion, rank }))
    .filter(
      (c): c is { suggestion: MoveSuggestion; rank: number } =>
        c.suggestion !== undefined
    )
    .map(({ suggestion, rank }) => ({
      suggestion,
      score:
        (suggestion.conflict === undefined ? 0 : 1e9) +
        suggestion.distance * (rank === 0 ? 1 : 1.5),
    }))
    .sort((a, b) => a.score - b.score)
  return ranked[0]?.suggestion
}
