"use client"

import { HistoryIcon } from "lucide-react"

import type { LintCounts } from "@roomer/core/schema"
import { EmptyState } from "@roomer/ui/components/empty-state"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { RelativeTime } from "@/components/common/relative-time"
import { SeverityIcon } from "@/components/common/severity-icon"
import { lintDelta, SEVERITY_NOUNS } from "@/lib/format/lint"

import { ActorAvatar, ACTOR_LABELS, type ActivityActor } from "./actor-avatar"

/** One change to a layout, as the feed shows it. */
export interface ActivityEvent {
  id: string
  actor: ActivityActor
  /** A human sentence: "Moved the sofa against W6". */
  summary: string
  revision: number
  /** Epoch ms. */
  createdAt: number
  /** Lint counts before and after, when the change re-linted the layout. */
  lintBefore?: LintCounts
  lintAfter?: LintCounts
}

/**
 * The layout's history, newest first, on a hairline timeline. Each entry:
 * who, what (one sentence), revision, when, and how lint moved
 * ("errors 2 → 0", sage when it improved). `events === undefined` = loading.
 */
export function ActivityFeed({
  events,
  now,
  className,
}: {
  events: readonly ActivityEvent[] | undefined
  now?: number
  className?: string
}) {
  if (events === undefined)
    return <ActivityFeedSkeleton className={className} />

  if (events.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<HistoryIcon />}
        title="No activity yet"
        description="Changes made by the agent — or by you — appear here as they happen."
      />
    )
  }

  return (
    <ol
      data-slot="activity-feed"
      aria-label="Activity"
      className={cn("relative flex flex-col px-4 py-3", className)}
    >
      {events.map((event, index) => (
        <li
          key={event.id}
          data-actor={event.actor}
          className="relative flex gap-3 pb-5 last:pb-1"
        >
          {index < events.length - 1 ? (
            <span
              aria-hidden
              className="absolute top-7 bottom-0 left-3 w-px -translate-x-1/2 bg-border"
            />
          ) : null}
          <ActorAvatar actor={event.actor} className="relative" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-[3px]">
            <p className="text-ui leading-snug text-foreground">
              <span className="sr-only">{ACTOR_LABELS[event.actor]}: </span>
              {event.summary}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
              <span className="font-mono tabular-nums">r{event.revision}</span>
              <span aria-hidden className="text-faint">
                ·
              </span>
              <RelativeTime at={event.createdAt} now={now} />
              {event.lintBefore && event.lintAfter ? (
                <LintDeltaChips
                  before={event.lintBefore}
                  after={event.lintAfter}
                />
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function LintDeltaChips({
  before,
  after,
}: {
  before: LintCounts
  after: LintCounts
}) {
  const changes = lintDelta(before, after)
  if (changes.length === 0) return null
  return (
    <span className="flex flex-wrap items-center gap-1">
      {changes.map(({ severity, before: b, after: a }) => {
        const better = a < b
        return (
          <span
            key={severity}
            data-severity={severity}
            data-improved={better || undefined}
            className={cn(
              "inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 font-mono text-[10px] tabular-nums",
              better
                ? "bg-sage-tint text-sage"
                : severity === "error"
                  ? "bg-error-tint text-error"
                  : severity === "warning"
                    ? "bg-warning-tint text-warning"
                    : "bg-info-tint text-info"
            )}
          >
            <SeverityIcon
              severity={severity}
              size={6}
              label={false}
              className={cn(better && "text-sage")}
            />
            {SEVERITY_NOUNS[severity][1]} {b} → {a}
          </span>
        )
      })}
    </span>
  )
}

function ActivityFeedSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy
      aria-label="Loading activity"
      className={cn("flex flex-col gap-5 px-4 py-3", className)}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-6 rounded-full" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
