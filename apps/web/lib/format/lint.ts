import type { LintCounts, LintSeverity } from "@roomer/core/schema"

// Lint summaries for cards, feeds and captions.

/** Most severe first — the order every list and summary uses. */
export const SEVERITY_ORDER = [
  "error",
  "warning",
  "info",
] as const satisfies readonly LintSeverity[]

/** Singular and plural nouns per level ("note" reads better than "info"). */
export const SEVERITY_NOUNS: Record<
  LintSeverity,
  [singular: string, plural: string]
> = {
  error: ["error", "errors"],
  warning: ["warning", "warnings"],
  info: ["note", "notes"],
}

/** (2, "warning") → "2 warnings"; (1, "info") → "1 note". */
export function pluraliseSeverity(
  count: number,
  severity: LintSeverity
): string {
  const [singular, plural] = SEVERITY_NOUNS[severity]
  return `${count} ${count === 1 ? singular : plural}`
}

export function totalIssues(counts: LintCounts): number {
  return counts.error + counts.warning + counts.info
}

/** The most severe level present, or null when the layout is clean. */
export function worstSeverity(counts: LintCounts): LintSeverity | null {
  return SEVERITY_ORDER.find((severity) => counts[severity] > 0) ?? null
}

/**
 * A sentence for screen readers and tooltips, skipping zero levels:
 * "2 errors, 1 note"; all zero → "No issues".
 */
export function formatLintCounts(counts: LintCounts): string {
  const parts = SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) =>
    pluraliseSeverity(counts[s], s)
  )
  return parts.length === 0 ? "No issues" : parts.join(", ")
}

export interface LintChange {
  severity: LintSeverity
  before: number
  after: number
}

/** The levels whose count changed between two reports, most severe first. */
export function lintDelta(before: LintCounts, after: LintCounts): LintChange[] {
  return SEVERITY_ORDER.filter((s) => before[s] !== after[s]).map(
    (severity) => ({
      severity,
      before: before[severity],
      after: after[severity],
    })
  )
}

/** "errors 2 → 0 · warnings 1 → 3"; no change → "". */
export function formatLintDelta(before: LintCounts, after: LintCounts): string {
  return lintDelta(before, after)
    .map(({ severity, before: b, after: a }) => {
      const plural = SEVERITY_NOUNS[severity][1]
      return `${plural} ${b} → ${a}`
    })
    .join(" · ")
}
