"use client"

import { useState } from "react"

import { cn } from "@roomer/ui/lib/utils"

import {
  formatRelativeTime,
  formatTimestamp,
  type RelativeTimeOptions,
} from "@/lib/format/relative-time"

/**
 * "3 min ago", as a <time> with the full timestamp on hover. `now` defaults
 * to the moment the component mounted (`useState(() => Date.now())`), so
 * render stays pure; pass it explicitly for deterministic output.
 */
export function RelativeTime({
  at,
  now: nowProp,
  style,
  className,
}: {
  /** Epoch milliseconds. */
  at: number
  now?: number
  style?: RelativeTimeOptions["style"]
  className?: string
}) {
  const [mountedAt] = useState(() => Date.now())
  const now = nowProp ?? mountedAt
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={formatTimestamp(at)}
      // Server and browser clocks (and zones) differ by design.
      suppressHydrationWarning
      className={cn("whitespace-nowrap tabular-nums", className)}
    >
      {formatRelativeTime(at, now, { style })}
    </time>
  )
}
