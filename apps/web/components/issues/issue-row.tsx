"use client"

import { LINT_RULES, type LintIssue } from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

import { SeverityIcon } from "@/components/common/severity-icon"

/** Placement and feature ids an issue involves, in that order. */
export function issueTargets(issue: LintIssue): string[] {
  return [...issue.placementIds, ...issue.featureIds]
}

/** A stable-enough identity for an issue (lint issues carry no id). */
export function issueKey(issue: LintIssue): string {
  return `${issue.code}:${issueTargets(issue).join(",")}`
}

export interface IssueRowCallbacks {
  /** Hover/focus enters (ids to highlight) or leaves (empty array). */
  onHover?: (ids: string[]) => void
  onSelect?: (issue: LintIssue) => void
}

/**
 * One lint issue: severity mark, code and rule title, the plain-English
 * message, the fix hint set like a margin note, and the involved items and
 * features as chips. Hovering or focusing it asks the viewer to highlight
 * those items.
 */
export function IssueRow({
  issue,
  selected = false,
  labels,
  onHover,
  onSelect,
  className,
}: IssueRowCallbacks & {
  issue: LintIssue
  selected?: boolean
  /** Display names by placement/feature id; unknown ids show as-is. */
  labels?: Readonly<Record<string, string>>
  className?: string
}) {
  const targets = issueTargets(issue)
  const enter = () => onHover?.(targets)
  const leave = () => onHover?.([])

  return (
    <button
      type="button"
      data-slot="issue-row"
      data-severity={issue.severity}
      data-code={issue.code}
      aria-pressed={onSelect ? selected : undefined}
      onClick={() => onSelect?.(issue)}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      className={cn(
        "group/issue relative flex w-full gap-3 rounded-md px-3 py-3 text-left transition-colors outline-none",
        "hover:bg-sunken/50 focus-visible:ring-2 focus-visible:ring-ring/45",
        "before:absolute before:inset-y-3 before:left-0 before:w-[2px] before:rounded-full before:opacity-0 before:transition-opacity",
        issue.severity === "error" && "before:bg-error-fill",
        issue.severity === "warning" && "before:bg-warning-fill",
        issue.severity === "info" && "before:bg-info-fill",
        selected && "bg-sunken/60 before:opacity-100 hover:bg-sunken/60",
        className
      )}
    >
      <span className="flex h-5 shrink-0 items-center">
        <SeverityIcon severity={issue.severity} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <code className="rounded-xs bg-sunken px-1 py-px font-mono text-2xs text-ink-soft">
            {issue.code}
          </code>
          <span className="truncate text-xs text-muted-foreground">
            {LINT_RULES[issue.code].title}
          </span>
        </span>
        <span className="text-ui leading-snug text-foreground">
          {issue.message}
        </span>
        {issue.hint ? (
          <span className="font-display text-[0.875rem] leading-snug text-ink-soft italic">
            {issue.hint}
          </span>
        ) : null}
        {targets.length > 0 ? (
          <span className="flex flex-wrap gap-1 pt-0.5">
            {issue.placementIds.map((id) => (
              <span
                key={`p:${id}`}
                data-placement-id={id}
                className="inline-flex h-5 items-center rounded-full border border-border bg-card px-2 text-2xs text-ink-soft"
              >
                {labels?.[id] ?? id}
              </span>
            ))}
            {issue.featureIds.map((id) => (
              <span
                key={`f:${id}`}
                data-feature-id={id}
                title={labels?.[id]}
                className="inline-flex h-5 items-center rounded-full border border-dashed border-rule px-2 font-mono text-2xs text-muted-foreground"
              >
                {id}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </button>
  )
}
