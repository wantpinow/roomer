"use client"

import { CheckIcon } from "lucide-react"

import type { LintIssue, LintSeverity } from "@roomer/core/schema"
import { EmptyState } from "@roomer/ui/components/empty-state"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { SeverityIcon } from "@/components/common/severity-icon"
import { SEVERITY_ORDER } from "@/lib/format/lint"

import { IssueRow, issueKey, type IssueRowCallbacks } from "./issue-row"

const GROUP_TITLES: Record<LintSeverity, string> = {
  error: "Errors",
  warning: "Warnings",
  info: "Notes",
}

/**
 * Lint issues grouped by severity, most severe first. `issues === undefined`
 * means loading; an empty list is the all-clear.
 */
export function IssueList({
  issues,
  selectedKey,
  labels,
  onHover,
  onSelect,
  className,
}: IssueRowCallbacks & {
  issues: readonly LintIssue[] | undefined
  /** `issueKey()` of the selected issue. */
  selectedKey?: string
  labels?: Readonly<Record<string, string>>
  className?: string
}) {
  if (issues === undefined) return <IssueListSkeleton className={className} />

  if (issues.length === 0) {
    return (
      <EmptyState
        className={className}
        tone="positive"
        icon={<CheckIcon />}
        title="No issues"
        description="This layout is physically sound."
      />
    )
  }

  return (
    <div
      data-slot="issue-list"
      className={cn("flex flex-col gap-4 p-2", className)}
    >
      {SEVERITY_ORDER.map((severity) => {
        const group = issues.filter((issue) => issue.severity === severity)
        if (group.length === 0) return null
        return (
          <section
            key={severity}
            aria-labelledby={`issues-${severity}`}
            data-severity={severity}
          >
            <h3
              id={`issues-${severity}`}
              className="flex items-center gap-2 px-3 pt-1 pb-1 eyebrow"
            >
              <SeverityIcon severity={severity} size={8} label={false} />
              {GROUP_TITLES[severity]}
              <span className="font-mono tabular-nums">{group.length}</span>
            </h3>
            <ul className="flex flex-col">
              {group.map((issue, index) => {
                const key = issueKey(issue)
                return (
                  <li key={`${key}#${index}`}>
                    <IssueRow
                      issue={issue}
                      labels={labels}
                      selected={selectedKey === key}
                      onHover={onHover}
                      onSelect={onSelect}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function IssueListSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy
      aria-label="Loading issues"
      className={cn("flex flex-col gap-2 p-2", className)}
    >
      <Skeleton className="mx-3 mt-1 h-2.5 w-16" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 px-3 py-3">
          <Skeleton className="size-2.5 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
