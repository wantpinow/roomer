import type { LintCounts as LintCountsValue } from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

import { formatLintCounts, SEVERITY_ORDER } from "@/lib/format/lint"

import { SeverityIcon } from "./severity-icon"

/**
 * Compact lint tally — ● 0 · ▲ 2 · ○ 1 — with zero levels faded so the eye
 * lands on what needs attention. The whole row has one accessible name.
 */
export function LintCounts({
  counts,
  hideZero = false,
  className,
}: {
  counts: LintCountsValue
  /** Drop levels with no issues (keeps at least the error level). */
  hideZero?: boolean
  className?: string
}) {
  const levels = SEVERITY_ORDER.filter(
    (s) => !hideZero || counts[s] > 0 || s === "error"
  )
  return (
    <span
      data-slot="lint-counts"
      role="img"
      aria-label={formatLintCounts(counts)}
      className={cn(
        "inline-flex items-center gap-2 text-xs tabular-nums",
        className
      )}
    >
      {levels.map((severity) => {
        const count = counts[severity]
        return (
          <span
            key={severity}
            data-severity={severity}
            data-count={count}
            className={cn(
              "inline-flex items-center gap-1",
              count === 0 ? "text-faint" : "text-ink-soft"
            )}
          >
            <SeverityIcon
              severity={severity}
              size={8}
              label={false}
              className={cn(count === 0 && "text-faint")}
            />
            {count}
          </span>
        )
      })}
    </span>
  )
}
