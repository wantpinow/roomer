import type { RoomGeometry } from "../geometry/room-geometry"
import {
  LINT_RULES,
  LINT_THRESHOLDS,
  type AssetSpec,
  type LintIssue,
  type LintReport,
  type Placement,
} from "../schema"
import { buildContext, type LintThresholds } from "./context"
import { lintItemCollisions, lintObstacleCollisions } from "./rules/collisions"
import { lintMounting, lintOutsideRoom } from "./rules/room"

// The layout linter (spec §7, architecture §3.5): a pure function from a
// room, its placements and their assets to a list of plain-English issues
// with numbers, ids, a concrete hint and a point to highlight on the plan.
// It runs on every change (inside Convex mutations), so it's built to take
// a few milliseconds.

export type { LintThresholds } from "./context"

export interface LintInput {
  room: RoomGeometry
  placements: readonly Placement[]
  /** Asset specs keyed by `placement.assetId`. */
  assets: Readonly<Record<string, AssetSpec>>
  /** Override individual thresholds (defaults: `LINT_THRESHOLDS`). */
  thresholds?: Partial<LintThresholds>
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

/** Plain code-unit order, identical in every runtime (no locale rules). */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Stable order: severity, then code, then the ids involved, then text. */
export function compareIssues(a: LintIssue, b: LintIssue): number {
  return (
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    compareText(a.code, b.code) ||
    compareText(a.placementIds.join(","), b.placementIds.join(",")) ||
    compareText(a.featureIds.join(","), b.featureIds.join(",")) ||
    compareText(a.message, b.message)
  )
}

export function lint(input: LintInput): LintReport {
  const thresholds: LintThresholds = {
    ...LINT_THRESHOLDS,
    ...input.thresholds,
  }
  const ctx = buildContext(
    input.room,
    input.placements,
    input.assets,
    thresholds
  )
  // Order matters only for de-duplication: E003 before E002 (skirting).
  const issues: LintIssue[] = [
    ...lintItemCollisions(ctx),
    ...lintOutsideRoom(ctx),
    ...lintObstacleCollisions(ctx),
    ...lintMounting(ctx),
  ]
  issues.sort(compareIssues)

  const counts = { error: 0, warning: 0, info: 0 }
  for (const issue of issues) counts[LINT_RULES[issue.code].severity]++
  return { ok: counts.error === 0, counts, issues }
}
