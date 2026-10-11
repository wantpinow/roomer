import { z } from "zod"

import { zFeatureId, zPlacementId, zVec2 } from "./primitives"

// Lint rules are declared once here (code → severity + title) and everything
// else — the issue schema, UI legends, docs — derives from this table.

export const LINT_RULES = {
  E001: { severity: "error", title: "Items overlap" },
  E002: { severity: "error", title: "Item overlaps a fixed obstacle" },
  E003: { severity: "error", title: "Item is outside the room" },
  E004: { severity: "error", title: "Item blocks a door's swing" },
  E005: { severity: "error", title: "Item blocks a doorway" },
  E006: { severity: "error", title: "Item can't physically sit there" },
  W101: { severity: "warning", title: "No clear walking route between doors" },
  W102: { severity: "warning", title: "Clearance zone blocked or unreachable" },
  W103: { severity: "warning", title: "Item in front of a radiator" },
  W104: { severity: "warning", title: "Item in front of a window" },
  W105: { severity: "warning", title: "Item is floating" },
  I201: { severity: "info", title: "Socket hidden behind an item" },
  I202: { severity: "info", title: "Tight walking route" },
  I203: { severity: "info", title: "Awkward narrow gap" },
} as const satisfies Record<
  string,
  { severity: "error" | "warning" | "info"; title: string }
>

export type LintCode = keyof typeof LINT_RULES

export const LINT_CODES = Object.keys(LINT_RULES) as [LintCode, ...LintCode[]]

export const zLintSeverity = z.enum(["error", "warning", "info"])
export const zLintCode = z.enum(LINT_CODES)

export const zLintIssue = z.object({
  code: zLintCode,
  severity: zLintSeverity,
  message: z
    .string()
    .describe("Plain-English description with names and millimetres"),
  placementIds: z.array(zPlacementId),
  featureIds: z.array(zFeatureId),
  hint: z.string().optional().describe("A concrete suggestion to fix it"),
  at: zVec2.optional().describe("Where on the plan to highlight"),
})

export const zLintCounts = z.object({
  error: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  info: z.number().int().nonnegative(),
})

export const zLintReport = z.object({
  ok: z.boolean().describe("True when there are no errors"),
  counts: zLintCounts,
  issues: z.array(zLintIssue),
})

export type LintSeverity = z.infer<typeof zLintSeverity>
export type LintIssue = z.infer<typeof zLintIssue>
export type LintCounts = z.infer<typeof zLintCounts>
export type LintReport = z.infer<typeof zLintReport>

/** Thresholds used by the lint rules, in mm. One place to tune them. */
export const LINT_THRESHOLDS = {
  overlapToleranceMm: 5,
  doorwayDepthMm: 600,
  walkwayMinMm: 700,
  walkwayComfortableMm: 900,
  clearanceReachMinMm: 500,
  walkingHeightMm: 1000,
  radiatorZoneMm: 300,
  windowZoneMm: 300,
  awkwardGapMinMm: 50,
  awkwardGapMaxMm: 300,
  wallMountToleranceMm: 20,
  supportToleranceMm: 10,
  gridCellMm: 25,
} as const
