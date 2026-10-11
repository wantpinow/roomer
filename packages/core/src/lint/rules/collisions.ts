import type { Point } from "../../geometry/angles"
import { formatMm } from "../../geometry/format"
import type { LintIssue } from "../../schema"
import type { LintContext, Obstacle, Solid } from "../context"
import { bestMove, moveText, suggestMove } from "../moves"
import { boundsOverlap } from "../polygons"
import {
  makeIssue,
  overlapSize,
  regionsCentre,
  solidOverlap,
  yOverlap,
} from "../shared"

// E001 (items overlap each other) and E002 (an item overlaps a fixed
// obstacle: radiator, pier, hearth, window sill or the skirting). Collisions
// are per part, so a chair tucked under a table top doesn't collide with it.

export function lintItemCollisions(ctx: LintContext): LintIssue[] {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const issues: LintIssue[] = []
  ctx.items.forEach((a, i) => {
    for (const b of ctx.items.slice(i + 1)) {
      // Rugs only collide with rugs; furniture only with furniture.
      if (a.covering !== b.covering) continue
      if (!boundsOverlap(a.bounds, b.bounds, tolerance)) continue
      if (yOverlap(a, b) <= tolerance) continue
      const regions: Point[][] = []
      for (const pa of a.parts) {
        for (const pb of b.parts) {
          const overlap = solidOverlap(pa, pb, tolerance)
          if (overlap) regions.push(...overlap.regions)
        }
      }
      if (regions.length === 0) continue
      ctx.reported.add(`E001:${a.id}:${b.id}`)
      ctx.reported.add(`E001:${b.id}:${a.id}`)
      const [small, large] = a.area <= b.area ? [a, b] : [b, a]
      const move = bestMove([
        suggestMove(ctx, small, large.parts),
        suggestMove(ctx, large, small.parts),
      ])
      issues.push(
        makeIssue({
          code: "E001",
          message: `${a.name} overlaps ${b.name} by ${overlapSize(regions)}.`,
          placementIds: [a.id, b.id],
          hint: move && moveText(ctx, move),
          at: regionsCentre(regions),
        })
      )
    }
  })
  return issues
}

interface ObstacleGroup {
  key: string
  obstacles: Obstacle[]
}

/** Skirting spans on one wall are one obstacle as far as messages go. */
function groupObstacles(obstacles: readonly Obstacle[]): ObstacleGroup[] {
  const groups = new Map<string, Obstacle[]>()
  for (const obstacle of obstacles) {
    const key =
      obstacle.kind === "skirting" && obstacle.wall
        ? `skirting:${obstacle.wall.id}`
        : obstacle.key
    groups.set(key, [...(groups.get(key) ?? []), obstacle])
  }
  return [...groups.entries()].map(([key, list]) => ({ key, obstacles: list }))
}

export function lintObstacleCollisions(ctx: LintContext): LintIssue[] {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const issues: LintIssue[] = []
  const groups = groupObstacles(ctx.obstacles)
  for (const item of ctx.items) {
    for (const group of groups) {
      const first = group.obstacles[0]!
      const skirting = first.kind === "skirting"
      // Rugs tuck against (or under) the skirting.
      if (skirting && item.covering) continue
      // Already reported as going through that wall (E003).
      if (skirting && ctx.reported.has(`E003:${item.id}:${first.wall?.id}`)) {
        continue
      }
      const regions: Point[][] = []
      let depth = 0
      const solids: Solid[] = group.obstacles.map((o) => o.solid)
      for (const part of item.parts) {
        for (const solid of solids) {
          const overlap = solidOverlap(part, solid, tolerance)
          if (!overlap) continue
          regions.push(...overlap.regions)
          depth = Math.max(depth, overlap.depth)
        }
      }
      if (regions.length === 0) continue
      if (first.featureId) {
        ctx.reported.add(`E002:${item.id}:${first.featureId}`)
      }
      const move = suggestMove(ctx, item, solids)
      const size = skirting ? formatMm(Math.round(depth)) : overlapSize(regions)
      issues.push(
        makeIssue({
          code: "E002",
          message: skirting
            ? `${item.name} overlaps ${first.name} by ${size} — it's pushed into the wall.`
            : `${item.name} overlaps ${first.name} by ${size}.`,
          placementIds: [item.id],
          featureIds: first.featureId ? [first.featureId] : [],
          hint: move && moveText(ctx, move, first.wall),
          at: regionsCentre(regions),
        })
      )
    }
  }
  return issues
}
