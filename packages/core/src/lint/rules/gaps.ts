import { bearingDelta, type Point } from "../../geometry/angles"
import { formatMm } from "../../geometry/format"
import { add, dot, scale } from "../../geometry/vec"
import { toWallFrame, wallPoint } from "../../geometry/walls"
import type { AssetCategory, LintIssue } from "../../schema"
import { makeSolid, type LintContext, type LintItem } from "../context"
import { nudgeText } from "../moves"
import { boundsCentre, boundsOverlap } from "../polygons"
import { footprintOverlap, makeIssue } from "../shared"
import { sideNormal, type ClearanceSide } from "./clearance"

// I203: a narrow gap (awkwardGapMinMm–awkwardGapMaxMm) between two pieces
// of furniture, or between furniture and a wall, along most of a shared
// edge. Deliberately conservative: only floor-standing, square-on items
// with nothing in the gap, ignoring chairs, lamps and decor (which are
// placed with gaps on purpose) and any side that has a clearance zone.

/** A gap must run along at least this share of the shorter facing edge. */
export const GAP_SHARED_EDGE_SHARE = 0.6
/** …and along at least this much, mm. */
export const GAP_SHARED_EDGE_MIN_MM = 300
/** Items lower than this (poufs, floor cushions) don't count. */
export const GAP_MIN_ITEM_HEIGHT_MM = 300

const IGNORED_CATEGORIES = new Set<AssetCategory>([
  "chair",
  "lighting",
  "decor",
  "rug",
])

const SIDES: ClearanceSide[] = ["front", "back", "left", "right"]

/** Plan corners of one side of an item's bounding rectangle. */
function sideEdge(item: LintItem, side: ClearanceSide): [Point, Point] {
  const { min, max } = item.local
  const edges: Record<ClearanceSide, [number, number, number, number]> = {
    front: [min[0], max[2], max[0], max[2]],
    back: [min[0], min[2], max[0], min[2]],
    left: [min[0], min[2], min[0], max[2]],
    right: [max[0], min[2], max[0], max[2]],
  }
  const [x0, z0, x1, z1] = edges[side]
  return [item.transform.toPlan(x0, z0), item.transform.toPlan(x1, z1)]
}

function candidate(ctx: LintContext, item: LintItem): boolean {
  return (
    item.asset.mount === "floor" &&
    !IGNORED_CATEGORIES.has(item.asset.category) &&
    item.placement.elevation <= ctx.thresholds.supportToleranceMm &&
    item.y1 >= GAP_MIN_ITEM_HEIGHT_MM
  )
}

function hasClearance(item: LintItem, side: ClearanceSide): boolean {
  return (item.asset.clearance?.[side] ?? 0) > 0
}

/** Is anything (an item or obstacle) standing in the gap rectangle? */
function gapOccupied(
  ctx: LintContext,
  gap: Point[],
  except: readonly string[]
): boolean {
  const zone = makeSolid(gap, 0, ctx.thresholds.walkingHeightMm)
  const tolerance = ctx.thresholds.overlapToleranceMm
  for (const other of ctx.items) {
    if (except.includes(other.id) || other.covering) continue
    if (!boundsOverlap(other.bounds, zone.bounds, tolerance)) continue
    if (other.parts.some((p) => footprintOverlap(p, zone, tolerance))) {
      return true
    }
  }
  return ctx.obstacles.some(
    (o) =>
      o.kind !== "skirting" &&
      footprintOverlap(o.solid, zone, tolerance) !== undefined
  )
}

function squareOn(a: LintItem, b: LintItem): boolean {
  const delta = bearingDelta(a.placement.facing, b.placement.facing) % 90
  return Math.min(delta, 90 - delta) <= 2
}

function sharedEdge(
  edge: [Point, Point],
  axis: Point,
  other: [Point, Point]
): { from: number; to: number; shorter: number } {
  const a = [dot(edge[0], axis), dot(edge[1], axis)].sort((p, q) => p - q)
  const b = [dot(other[0], axis), dot(other[1], axis)].sort((p, q) => p - q)
  const from = Math.max(a[0]!, b[0]!)
  const to = Math.min(a[1]!, b[1]!)
  return {
    from,
    to,
    shorter: Math.min(a[1]! - a[0]!, b[1]! - b[0]!),
  }
}

function longEnough(shared: { from: number; to: number; shorter: number }) {
  const length = shared.to - shared.from
  return (
    length >= GAP_SHARED_EDGE_MIN_MM &&
    length >= GAP_SHARED_EDGE_SHARE * shared.shorter
  )
}

function gapIssue(
  ctx: LintContext,
  item: LintItem,
  otherName: string,
  gap: number,
  towards: Point,
  rect: Point[],
  placementIds: string[]
): LintIssue {
  const { awkwardGapMaxMm } = ctx.thresholds
  const close = Math.round(gap)
  return makeIssue({
    code: "I203",
    message: `There's a ${formatMm(close)} gap between ${item.name} and ${otherName} — gaps this narrow collect dust and look accidental.`,
    placementIds,
    hint: `Close it (nudge ${item.id} ${nudgeText(towards, close)}) or open it up to at least ${formatMm(awkwardGapMaxMm)}.`,
    at: boundsCentre({
      minX: Math.min(...rect.map((p) => p[0])),
      maxX: Math.max(...rect.map((p) => p[0])),
      minZ: Math.min(...rect.map((p) => p[1])),
      maxZ: Math.max(...rect.map((p) => p[1])),
    }),
  })
}

export function lintAwkwardGaps(ctx: LintContext): LintIssue[] {
  const { awkwardGapMinMm: low, awkwardGapMaxMm: high } = ctx.thresholds
  const issues: LintIssue[] = []
  const items = ctx.items.filter((item) => candidate(ctx, item))

  items.forEach((a, i) => {
    for (const b of items.slice(i + 1)) {
      if (!squareOn(a, b)) continue
      for (const sideA of SIDES) {
        const normal = sideNormal(a, sideA)
        const edgeA = sideEdge(a, sideA)
        const faceA = dot(edgeA[0], normal)
        // B's side facing back towards A.
        const sideB = SIDES.find((s) => dot(sideNormal(b, s), normal) < -0.999)
        if (!sideB) continue
        const edgeB = sideEdge(b, sideB)
        const gap = dot(edgeB[0], normal) - faceA
        if (gap < low || gap > high) continue
        if (hasClearance(a, sideA) || hasClearance(b, sideB)) continue
        const axis: Point = [-normal[1], normal[0]]
        const shared = sharedEdge(edgeA, axis, edgeB)
        if (!longEnough(shared)) continue
        const rect: Point[] = [
          add(scale(axis, shared.from), scale(normal, faceA)),
          add(scale(axis, shared.to), scale(normal, faceA)),
          add(scale(axis, shared.to), scale(normal, faceA + gap)),
          add(scale(axis, shared.from), scale(normal, faceA + gap)),
        ]
        if (gapOccupied(ctx, rect, [a.id, b.id])) continue
        issues.push(gapIssue(ctx, a, b.name, gap, normal, rect, [a.id, b.id]))
      }
    }
  })

  const skirting = ctx.room.skirting.depth
  for (const item of items) {
    for (const side of SIDES) {
      if (hasClearance(item, side)) continue
      const normal = sideNormal(item, side)
      const edge = sideEdge(item, side)
      for (const wall of ctx.walls) {
        if (dot(normal, wall.normal) > -0.999) continue
        const p = toWallFrame(wall, edge[0])
        const q = toWallFrame(wall, edge[1])
        const gap = Math.min(p.inset, q.inset) - skirting
        if (gap < low || gap > high) continue
        const from = Math.max(0, Math.min(p.along, q.along))
        const to = Math.min(wall.length, Math.max(p.along, q.along))
        const shorter = Math.min(Math.abs(q.along - p.along), wall.length)
        if (!longEnough({ from, to, shorter })) continue
        const inset = Math.min(p.inset, q.inset)
        const rect: Point[] = [
          wallPoint(wall, from, skirting),
          wallPoint(wall, to, skirting),
          wallPoint(wall, to, inset),
          wallPoint(wall, from, inset),
        ]
        if (gapOccupied(ctx, rect, [item.id])) continue
        issues.push(gapIssue(ctx, item, wall.id, gap, normal, rect, [item.id]))
      }
    }
  }
  return issues
}
