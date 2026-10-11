import type { Point } from "../../geometry/angles"
import { formatMm } from "../../geometry/format"
import { toWallFrame, wallPoint, type Wall } from "../../geometry/walls"
import { isWallFeature, type LintIssue, type WindowFeature } from "../../schema"
import {
  featureRef,
  findWallOf,
  makeSolid,
  type LintContext,
  type Solid,
} from "../context"
import { moveText, suggestMove } from "../moves"
import { makeIssue, regionsCentre, solidOverlap } from "../shared"

// W103 (a tall item within radiatorZoneMm of a radiator's front) and W104
// (an item rising above the sill within windowZoneMm of a window).

/** Items up to this tall (benches, low tables) can sit near a radiator. */
export const TALL_ITEM_MM = 300

/** A strip in front of a wall span, from `from` to `to` mm off the plaster. */
function frontStrip(
  wall: Wall,
  offset: number,
  width: number,
  from: number,
  to: number,
  y0: number,
  y1: number
): Solid {
  return makeSolid(
    [
      wallPoint(wall, offset, from),
      wallPoint(wall, offset + width, from),
      wallPoint(wall, offset + width, to),
      wallPoint(wall, offset, to),
    ],
    y0,
    y1
  )
}

function zoneHits(
  ctx: LintContext,
  zone: Solid,
  skip: (itemId: string) => boolean
): { itemIndex: number; regions: Point[][] }[] {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const hits: { itemIndex: number; regions: Point[][] }[] = []
  ctx.items.forEach((item, itemIndex) => {
    if (item.covering || skip(item.id)) return
    const regions: Point[][] = []
    for (const part of item.parts) {
      const overlap = solidOverlap(part, zone, tolerance)
      if (overlap) regions.push(...overlap.regions)
    }
    if (regions.length > 0) hits.push({ itemIndex, regions })
  })
  return hits
}

export function lintRadiators(ctx: LintContext): LintIssue[] {
  const zoneDepth = ctx.thresholds.radiatorZoneMm
  const issues: LintIssue[] = []
  for (const obstacle of ctx.obstacles) {
    if (obstacle.kind !== "radiator" || !obstacle.wall || !obstacle.featureId) {
      continue
    }
    const feature = ctx.room.features.find((f) => f.id === obstacle.featureId)
    if (!feature || feature.type !== "radiator") continue
    const wall = obstacle.wall
    const top = feature.bottom + feature.height
    const zone = frontStrip(
      wall,
      feature.offset,
      feature.width,
      feature.depth,
      feature.depth + zoneDepth,
      0,
      top
    )
    const hits = zoneHits(
      ctx,
      zone,
      (id) =>
        ctx.reported.has(`E002:${id}:${feature.id}`) ||
        (ctx.items.find((i) => i.id === id)?.y1 ?? 0) <= TALL_ITEM_MM
    )
    for (const { itemIndex, regions } of hits) {
      const item = ctx.items[itemIndex]!
      const gap = Math.max(
        0,
        Math.round(
          Math.min(...regions.flat().map((p) => toWallFrame(wall, p).inset)) -
            feature.depth
        )
      )
      const move = suggestMove(ctx, item, [zone])
      issues.push(
        makeIssue({
          code: "W103",
          message: `${item.name} stands ${formatMm(gap)} in front of ${obstacle.name}: anything over ${formatMm(TALL_ITEM_MM)} tall within ${formatMm(zoneDepth)} of a radiator blocks its heat.`,
          placementIds: [item.id],
          featureIds: [feature.id],
          hint: move && moveText(ctx, move, wall),
          at: regionsCentre(regions),
        })
      )
    }
  }
  return issues
}

export function lintWindows(ctx: LintContext): LintIssue[] {
  const zoneDepth = ctx.thresholds.windowZoneMm
  const issues: LintIssue[] = []
  const windows = ctx.room.features
    .filter(isWallFeature)
    .filter((f): f is WindowFeature => f.type === "window")
  for (const window of windows) {
    const wall = findWallOf(ctx.walls, window)
    if (!wall) continue
    const zone = frontStrip(
      wall,
      window.offset,
      window.width,
      0,
      zoneDepth,
      window.bottom,
      window.bottom + window.height
    )
    const hits = zoneHits(ctx, zone, (id) =>
      ctx.reported.has(`E002:${id}:${window.id}`)
    )
    for (const { itemIndex, regions } of hits) {
      const item = ctx.items[itemIndex]!
      const gap = Math.max(
        0,
        Math.round(
          Math.min(...regions.flat().map((p) => toWallFrame(wall, p).inset))
        )
      )
      const move = suggestMove(ctx, item, [zone])
      issues.push(
        makeIssue({
          code: "W104",
          message: `${item.name} (top at ${formatMm(Math.round(item.y1))}) stands ${formatMm(gap)} from ${featureRef(window)}, above its ${formatMm(window.bottom)} sill — it blocks the light and the way to the window.`,
          placementIds: [item.id],
          featureIds: [window.id],
          hint: move && moveText(ctx, move, wall),
          at: regionsCentre(regions),
        })
      )
    }
  }
  return issues
}
