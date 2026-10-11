import type { Point } from "../../geometry/angles"
import { containsPoint } from "../../geometry/polygon"
import { formatMm } from "../../geometry/format"
import type { LintIssue } from "../../schema"
import type { LintContext, LintItem } from "../context"
import { intersect, polygonArea, union } from "../polygons"
import { joinWords, makeIssue } from "../shared"

// W105: a floor item raised off the floor (a lamp on a sideboard, a TV on a
// bench) must stand on something — another item's top, a hearth, a sill —
// under at least half of its base.

/** Share of the base that must rest on a surface. */
export const MIN_SUPPORTED_SHARE = 0.5

interface Surface {
  name: string
  footprint: Point[]
  top: number
}

function surfaces(ctx: LintContext, item: LintItem): Surface[] {
  const found: Surface[] = []
  for (const other of ctx.items) {
    if (other.id === item.id || other.covering) continue
    for (const part of other.parts) {
      found.push({ name: other.name, footprint: part.footprint, top: part.y1 })
    }
  }
  for (const obstacle of ctx.obstacles) {
    if (obstacle.kind === "skirting") continue
    found.push({
      name: obstacle.name,
      footprint: obstacle.solid.footprint,
      top: obstacle.solid.y1,
    })
  }
  return found
}

function area(polygons: readonly Point[][][]): number {
  return polygons.reduce(
    (sum, [outer, ...holes]) =>
      sum +
      (outer ? polygonArea(outer) : 0) -
      holes.reduce((h, ring) => h + polygonArea(ring), 0),
    0
  )
}

export function lintSupport(ctx: LintContext): LintIssue[] {
  const tolerance = ctx.thresholds.supportToleranceMm
  const issues: LintIssue[] = []
  for (const item of ctx.items) {
    const mount = item.asset.mount
    if (mount !== "floor" && mount !== "floor-covering") continue
    const elevation = item.placement.elevation
    if (elevation <= tolerance) continue
    const base = item.parts
      .filter((p) => p.y0 <= item.y0 + tolerance)
      .map((p) => p.footprint)
    const baseShape = union(base)
    const baseArea = area(baseShape)
    if (baseArea <= 0) continue
    const all = surfaces(ctx, item)
    const touching = all.filter((s) => Math.abs(s.top - item.y0) <= tolerance)
    let supported = 0
    const names = new Set<string>()
    if (touching.length > 0) {
      const top = union(touching.map((s) => s.footprint))
      for (const [outer] of baseShape) {
        if (!outer) continue
        for (const [surface] of top) {
          if (!surface) continue
          for (const region of intersect(outer, surface, false, false)) {
            supported += polygonArea(region)
          }
        }
      }
      for (const surface of touching) {
        if (base.some((b) => intersect(b, surface.footprint).length > 0)) {
          names.add(surface.name)
        }
      }
    }
    const share = supported / baseArea
    if (share >= MIN_SUPPORTED_SHARE) continue

    const centre: Point = [item.placement.x, item.placement.z]
    const under = all
      .filter((s) => s.top < item.y0 && containsPoint(s.footprint, centre))
      .sort((a, b) => b.top - a.top)[0]
    const resting =
      names.size > 0
        ? `only ${Math.round(share * 100)}% of its base rests on ${joinWords([...names])}`
        : "nothing is under it"
    issues.push(
      makeIssue({
        code: "W105",
        message: `${item.name} is ${formatMm(elevation)} off the floor and ${resting}, so it would float.`,
        placementIds: [item.id],
        hint: under
          ? `Stand it on ${under.name}: set ${item.id}'s elevation to ${Math.round(under.top - (item.y0 - elevation))}, or to 0 to put it on the floor.`
          : `Set ${item.id}'s elevation to 0 to put it on the floor, or centre it on a table or sideboard and set the elevation to that item's height.`,
        at: centre,
      })
    )
  }
  return issues
}
