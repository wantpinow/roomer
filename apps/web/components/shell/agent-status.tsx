"use client"

import { useEffect, useState } from "react"

import { LiveDot } from "@roomer/ui/components/live-dot"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@roomer/ui/components/tooltip"
import { cn } from "@roomer/ui/lib/utils"

import { formatRelativeTime } from "@/lib/format/relative-time"

/** How recent MCP activity must be to count as "active". */
export const AGENT_ACTIVE_WINDOW_MS = 90_000

/**
 * "Agent active" with a breathing clay dot while the agent has touched
 * something recently; a quiet "Agent idle" otherwise. Re-checks itself every
 * few seconds while active so it settles back to idle on its own.
 */
export function AgentStatus({
  lastActivityAt,
  activeWindowMs = AGENT_ACTIVE_WINDOW_MS,
  className,
}: {
  /** Epoch ms of the latest MCP-driven change, or null if none yet. */
  lastActivityAt: number | null | undefined
  activeWindowMs?: number
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())
  const active = lastActivityAt != null && now - lastActivityAt < activeWindowMs

  useEffect(() => {
    if (lastActivityAt == null) return
    // Re-sync on every new event, then tick while it could still expire.
    const tick = () => setNow(Date.now())
    const id = window.setInterval(tick, 5_000)
    const sync = window.setTimeout(tick, 0)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(sync)
    }
  }, [lastActivityAt])

  const detail =
    lastActivityAt == null
      ? "No agent activity yet"
      : `Last change ${formatRelativeTime(lastActivityAt, now)}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-slot="agent-status"
          data-active={active || undefined}
          tabIndex={0}
          className={cn(
            "inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
            active
              ? "border-clay/20 bg-clay-tint text-clay"
              : "border-border text-muted-foreground",
            className
          )}
        >
          <LiveDot live={active} tone={active ? "clay" : "muted"} />
          <span aria-live="polite">
            {active ? "Agent active" : "Agent idle"}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{detail}</TooltipContent>
    </Tooltip>
  )
}
