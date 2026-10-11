import { bearingDelta, type Point } from "../../geometry/angles"
import { pointSegmentDistance } from "../../geometry/distance"
import { containsPoint } from "../../geometry/polygon"
import { formatDegrees, formatMm } from "../../geometry/format"
import { add, scale } from "../../geometry/vec"
import { toWallFrame, type Wall } from "../../geometry/walls"
import type { LintIssue } from "../../schema"
import {
  makeSolid,
  type Beam,
  type LintContext,
  type LintItem,
} from "../context"
import {
  conflictFor,
  moveText,
  nudgeText,
  outsideDepth,
  suggestMove,
  type MoveSuggestion,
} from "../moves"
import { difference, minWidth, translate } from "../polygons"
import { joinWords, makeIssue, regionsCentre, solidOverlap } from "../shared"

// E003 (an item goes through a wall) and E006 (it can't physically be
// there: above the ceiling, or a wall/ceiling item that isn't attached).

/** Facing slack for a wall item's back to count as against a wall. */
const MOUNT_FACING_TOLERANCE_DEG = 10

function outsideRegions(ctx: LintContext, item: LintItem): Point[][] {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const regions: Point[][] = []
  for (const part of item.parts) {
    if (outsideDepth(ctx, part.footprint) <= tolerance) continue
    for (const region of difference(part.footprint, [ctx.polygon])) {
      if (minWidth(region) > tolerance) regions.push(region)
    }
  }
  return regions
}

/** How far the regions reach behind each wall they cross, mm. */
export function penetrations(
  ctx: LintContext,
  regions: readonly Point[][]
): Map<Wall, number> {
  const result = new Map<Wall, number>()
  const points = regions.flat()
  for (const wall of ctx.walls) {
    for (const point of points) {
      const { along, inset } = toWallFrame(wall, point)
      if (inset >= -0.5 || along < -1 || along > wall.length + 1) continue
      result.set(wall, Math.max(result.get(wall) ?? 0, -inset))
    }
  }
  if (result.size === 0) {
    // Only past a corner: blame the nearest wall.
    for (const point of points) {
      const nearest = ctx.walls.reduce((best, wall) =>
        pointSegmentDistance(point, wall.start, wall.end) <
        pointSegmentDistance(point, best.start, best.end)
          ? wall
          : best
      )
      const distance = pointSegmentDistance(point, nearest.start, nearest.end)
      result.set(nearest, Math.max(result.get(nearest) ?? 0, distance))
    }
  }
  return result
}

function fitsInside(ctx: LintContext, item: LintItem, offset: Point): boolean {
  const tolerance = ctx.thresholds.overlapToleranceMm
  return item.parts.every(
    (part) => outsideDepth(ctx, translate(part.footprint, offset)) <= tolerance
  )
}

function outsideHint(
  ctx: LintContext,
  item: LintItem,
  walls: readonly [Wall, number][]
): string {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const usesSkirting =
    !item.covering && item.y0 < ctx.room.skirting.height - tolerance
  const extra = usesSkirting ? ctx.room.skirting.depth : 0
  const moves = walls
    .map(([wall, depth]) => ({
      wall,
      distance: Math.ceil(depth + extra),
    }))
    .sort((a, b) => a.distance - b.distance)
  for (const { wall, distance } of moves) {
    const offset = scale(wall.normal, distance)
    if (!fitsInside(ctx, item, offset)) continue
    const parts = item.parts.map((p) =>
      makeSolid(translate(p.footprint, offset), p.y0, p.y1)
    )
    const conflict = conflictFor(ctx, item, parts)
    const suggestion: MoveSuggestion = {
      item,
      direction: wall.normal,
      distance,
      ...(conflict ? { conflict } : {}),
    }
    return moveText(ctx, suggestion, wall)
  }
  const offset = moves.reduce<Point>(
    (sum, { wall, distance }) => add(sum, scale(wall.normal, distance)),
    [0, 0]
  )
  const length = Math.hypot(offset[0], offset[1])
  const direction: Point = [offset[0] / length, offset[1] / length]
  return `Move ${item.name} away from ${joinWords(moves.map((m) => m.wall.id))} (nudge ${item.id} ${nudgeText(direction, length)}).`
}

export function lintOutsideRoom(ctx: LintContext): LintIssue[] {
  const issues: LintIssue[] = []
  for (const item of ctx.items) {
    const regions = outsideRegions(ctx, item)
    if (regions.length === 0) continue
    const walls = [...penetrations(ctx, regions).entries()]
      .map(([wall, depth]): [Wall, number] => [wall, Math.round(depth)])
      .sort((a, b) => b[1] - a[1] || a[0].index - b[0].index)
    for (const [wall] of walls) ctx.reported.add(`E003:${item.id}:${wall.id}`)
    const through =
      walls.length === 1
        ? `goes ${formatMm(walls[0]![1])} through ${walls[0]![0].id}`
        : `goes through ${joinWords(walls.map(([w, d]) => `${w.id} (${formatMm(d)})`))}`
    issues.push(
      makeIssue({
        code: "E003",
        message: `${item.name} ${through} — part of it is outside the room.`,
        placementIds: [item.id],
        hint: outsideHint(ctx, item, walls),
        at: regionsCentre(regions),
      })
    )
  }
  return issues
}

/**
 * Gap between a wall item's back and the wall it faces away from (the
 * smallest, if several), or undefined when its back isn't to any wall.
 */
function mountGap(ctx: LintContext, item: LintItem): number | undefined {
  const { local, transform } = item
  const backA = transform.toPlan(local.min[0], local.min[2])
  const backB = transform.toPlan(local.max[0], local.min[2])
  let best: number | undefined
  for (const wall of ctx.walls) {
    if (
      bearingDelta(item.placement.facing, wall.inwardBearing) >
      MOUNT_FACING_TOLERANCE_DEG
    ) {
      continue
    }
    const a = toWallFrame(wall, backA)
    const b = toWallFrame(wall, backB)
    const from = Math.max(0, Math.min(a.along, b.along))
    const to = Math.min(wall.length, Math.max(a.along, b.along))
    if (to - from <= 0) continue
    const gap = Math.min(a.inset, b.inset)
    if (best === undefined || Math.abs(gap) < Math.abs(best)) best = gap
  }
  return best
}

function nearestWall(ctx: LintContext, point: Point): Wall {
  return ctx.walls.reduce((best, wall) =>
    pointSegmentDistance(point, wall.start, wall.end) <
    pointSegmentDistance(point, best.start, best.end)
      ? wall
      : best
  )
}

function wallMountIssue(
  ctx: LintContext,
  item: LintItem
): LintIssue | undefined {
  const tolerance = ctx.thresholds.wallMountToleranceMm
  const gapToWall = mountGap(ctx, item)
  // Behind the plaster is E003's problem; within tolerance is mounted.
  if (gapToWall !== undefined && gapToWall <= tolerance) return undefined
  const { local, transform } = item
  const back = transform.toPlan((local.min[0] + local.max[0]) / 2, local.min[2])
  // Report against the wall nearest the item's back, whichever way it faces.
  const wall = nearestWall(ctx, back)
  const gap = Math.round(pointSegmentDistance(back, wall.start, wall.end))
  const along = Math.round(
    Math.max(0, Math.min(wall.length, toWallFrame(wall, back).along))
  )
  const turned =
    bearingDelta(item.placement.facing, wall.inwardBearing) >
    MOUNT_FACING_TOLERANCE_DEG
      ? ` and it faces ${formatDegrees(item.placement.facing)} rather than ${formatDegrees(wall.inwardBearing)} (out from ${wall.id})`
      : ""
  return makeIssue({
    code: "E006",
    message: `${item.name} is wall-mounted, but its back is ${formatMm(gap)} from ${wall.id}${turned}, so it would hang in mid-air.`,
    placementIds: [item.id],
    hint: `Hang it on the wall: move ${item.id} to { mode: "onWall", wall: "${wall.id}", at: ${along}, elevation: ${item.placement.elevation} }.`,
    at: back,
  })
}

export function lintMounting(ctx: LintContext): LintIssue[] {
  const issues: LintIssue[] = []
  const ceiling = ctx.room.ceilingHeight
  const tolerance = ctx.thresholds.overlapToleranceMm
  const centre = (item: LintItem): Point => [item.placement.x, item.placement.z]
  for (const item of ctx.items) {
    const height = item.y1 - item.placement.elevation
    if (item.y1 > ceiling + tolerance) {
      const over = Math.round(item.y1 - ceiling)
      const canLower =
        item.asset.mount !== "ceiling" &&
        item.placement.elevation >= over &&
        item.asset.mount !== "floor-covering"
      issues.push(
        makeIssue({
          code: "E006",
          message: `${item.name} reaches ${formatMm(Math.round(item.y1))}, ${formatMm(over)} above the ${formatMm(ceiling)} ceiling.`,
          placementIds: [item.id],
          hint:
            item.asset.mount === "ceiling" && height <= ceiling
              ? `Set ${item.id}'s elevation to ${Math.round(ceiling - height)} so its top meets the ceiling.`
              : canLower
                ? `Lower ${item.name} by ${formatMm(over)} (elevation ${item.placement.elevation - over}).`
                : `Choose a lower item: it's ${formatMm(Math.round(height))} tall and the ceiling is ${formatMm(ceiling)}.`,
          at: centre(item),
        })
      )
      continue
    }
    if (item.asset.mount === "wall") {
      const issue = wallMountIssue(ctx, item)
      if (issue) issues.push(issue)
    } else if (item.asset.mount === "ceiling") {
      // Under a beam, the beam's underside is what it hangs from.
      const beam = beamOver(ctx, centre(item))
      const fixing = beam ? beam.underside : ceiling
      const below = fixing - item.y1
      if (below > ctx.thresholds.wallMountToleranceMm) {
        const from = beam ? `ceiling beam ${beam.feature.id}` : "the ceiling"
        issues.push(
          makeIssue({
            code: "E006",
            message: `${item.name} hangs from ${from}, but its top is ${formatMm(Math.round(below))} below it, so nothing holds it up.`,
            placementIds: [item.id],
            featureIds: beam ? [beam.feature.id] : [],
            hint: `Set ${item.id}'s elevation to ${Math.round(fixing - height)} so its top meets ${beam ? "the beam" : "the ceiling"} (or pick a longer drop).`,
            at: centre(item),
          })
        )
      }
    }
  }
  issues.push(...beamIssues(ctx))
  return issues
}

/** The lowest beam directly above a plan point, if any. */
function beamOver(ctx: LintContext, point: Point): Beam | undefined {
  return ctx.beams
    .filter((beam) => containsPoint(beam.solid.footprint, point))
    .sort((a, b) => a.underside - b.underside)[0]
}

/** E006: an item reaching up into a ceiling beam. */
function beamIssues(ctx: LintContext): LintIssue[] {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const issues: LintIssue[] = []
  for (const beam of ctx.beams) {
    for (const item of ctx.items) {
      // Already above the ceiling: that error says enough.
      if (item.y1 > ctx.room.ceilingHeight + tolerance) continue
      const parts = item.parts.filter(
        (part) => solidOverlap(part, beam.solid, tolerance) !== undefined
      )
      if (parts.length === 0) continue
      // A ceiling item hung from the beam's underside is fine.
      if (
        item.asset.mount === "ceiling" &&
        beamOver(ctx, [item.placement.x, item.placement.z]) === beam &&
        item.y1 <= beam.underside + tolerance
      ) {
        continue
      }
      const top = Math.round(Math.max(...parts.map((p) => p.y1)))
      const move = suggestMove(ctx, item, [beam.solid])
      issues.push(
        makeIssue({
          code: "E006",
          message: `${item.name} reaches ${formatMm(top)}, but ceiling beam ${beam.feature.id} is only ${formatMm(beam.underside)} above the floor here.`,
          placementIds: [item.id],
          featureIds: [beam.feature.id],
          hint: move
            ? `${moveText(ctx, move).replace(/\.$/, "")}, or choose something under ${formatMm(beam.underside)} tall.`
            : `Choose something under ${formatMm(beam.underside)} tall.`,
          at: regionsCentre(
            parts.flatMap(
              (part) => solidOverlap(part, beam.solid, tolerance)?.regions ?? []
            )
          ),
        })
      )
    }
  }
  return issues
}
