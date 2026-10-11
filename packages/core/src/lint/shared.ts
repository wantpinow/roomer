import type { Point } from "../geometry/angles"
import { formatMm } from "../geometry/format"
import { bounds, type Bounds2 } from "../geometry/polygon"
import { LINT_RULES, type LintCode, type LintIssue } from "../schema"
import type { Solid } from "./context"
import { boundsCentre, boundsOverlap, intersect, minWidth } from "./polygons"

// Small helpers every rule uses: overlap tests between solids and building
// issues in the shared message style.

/** How much two height ranges overlap (negative when apart). */
export function yOverlap(
  a: Pick<Solid, "y0" | "y1">,
  b: Pick<Solid, "y0" | "y1">
): number {
  return Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
}

export interface Overlap {
  /** Minimum width of the thickest overlap region, mm. */
  depth: number
  regions: Point[][]
}

/**
 * Where two footprints overlap by more than `tolerance` (measured as the
 * overlap's minimum width, so a long sliver along a shared edge is fine).
 */
export function footprintOverlap(
  a: Pick<Solid, "footprint" | "bounds" | "convex">,
  b: Pick<Solid, "footprint" | "bounds" | "convex">,
  tolerance: number
): Overlap | undefined {
  if (!boundsOverlap(a.bounds, b.bounds, tolerance)) return undefined
  const regions = intersect(a.footprint, b.footprint, a.convex, b.convex)
  let depth = 0
  for (const region of regions) depth = Math.max(depth, minWidth(region))
  return depth > tolerance ? { depth, regions } : undefined
}

/** Footprint overlap of two solids whose heights overlap by > tolerance. */
export function solidOverlap(
  a: Solid,
  b: Solid,
  tolerance: number
): Overlap | undefined {
  if (yOverlap(a, b) <= tolerance) return undefined
  return footprintOverlap(a, b, tolerance)
}

export function regionsBounds(regions: readonly Point[][]): Bounds2 {
  return bounds(regions.flat())
}

/** "120mm × 340mm" — the x × z size of the overlap's bounding box. */
export function overlapSize(regions: readonly Point[][]): string {
  const box = regionsBounds(regions)
  return `${formatMm(Math.round(box.maxX - box.minX))} × ${formatMm(
    Math.round(box.maxZ - box.minZ)
  )}`
}

export function regionsCentre(regions: readonly Point[][]): Point {
  return boundsCentre(regionsBounds(regions))
}

export interface IssueInit {
  code: LintCode
  message: string
  placementIds?: readonly string[]
  featureIds?: readonly string[]
  hint?: string | undefined
  at?: Point | undefined
}

export function makeIssue(init: IssueInit): LintIssue {
  const issue: LintIssue = {
    code: init.code,
    severity: LINT_RULES[init.code].severity,
    message: init.message,
    placementIds: [...(init.placementIds ?? [])],
    featureIds: [...(init.featureIds ?? [])],
  }
  if (init.hint) issue.hint = init.hint
  if (init.at) {
    issue.at = [Math.round(init.at[0]) || 0, Math.round(init.at[1]) || 0]
  }
  return issue
}

/** "a", "a and b", "a, b and c". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? ""
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
