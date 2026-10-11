import type {
  LayoutStatus,
  LintCounts as LintCountsValue,
} from "@roomer/core/schema"
import { LiveDot } from "@roomer/ui/components/live-dot"
import { cn } from "@roomer/ui/lib/utils"

import { ImageFrame } from "@/components/common/image-frame"
import { LintCounts } from "@/components/common/lint-counts"
import { RelativeTime } from "@/components/common/relative-time"

import { LayoutStatusChip } from "./layout-status-chip"

/** What the layouts rail needs to know about one layout. */
export interface LayoutSummary {
  id: string
  name: string
  status: LayoutStatus
  lintCounts: LintCountsValue
  revision: number
  /** Epoch ms of the last change. */
  updatedAt: number
  /** Small plan snapshot, if one has been rendered. */
  thumbnailUrl?: string
  /** True while the agent is changing this layout right now. */
  live?: boolean
}

/**
 * One layout in the rail. The whole card selects it (a stretched button);
 * the actions slot (e.g. <LayoutActionsMenu>) sits above that hit area.
 */
export function LayoutCard({
  layout,
  selected = false,
  onSelect,
  actions,
  now,
  className,
}: {
  layout: LayoutSummary
  selected?: boolean
  onSelect?: (id: string) => void
  actions?: React.ReactNode
  /** Clock for relative times; defaults to mount time. */
  now?: number
  className?: string
}) {
  const archived = layout.status === "archived"
  return (
    <div
      data-slot="layout-card"
      data-selected={selected || undefined}
      data-layout-id={layout.id}
      className={cn(
        "group/layout relative flex gap-3 rounded-md border border-transparent px-3 py-2.5 transition-colors",
        "hover:bg-card/70",
        selected && "border-border bg-card shadow-hairline hover:bg-card",
        "before:absolute before:inset-y-2.5 before:left-0 before:w-[2px] before:rounded-full before:bg-clay-fill before:opacity-0 before:transition-opacity",
        selected && "before:opacity-100",
        className
      )}
    >
      {layout.thumbnailUrl !== undefined ? (
        <ImageFrame
          src={layout.thumbnailUrl}
          alt=""
          ratio="1"
          className="w-11 shrink-0 self-start rounded-sm border border-border"
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {layout.live ? (
            <LiveDot live aria-label="Agent is editing" role="img" />
          ) : null}
          <button
            type="button"
            onClick={() => onSelect?.(layout.id)}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "min-w-0 truncate text-left text-ui font-medium outline-none",
              "after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/45",
              archived ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {layout.name}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <LayoutStatusChip status={layout.status} />
          <LintCounts counts={layout.lintCounts} className="ml-auto" />
        </div>
        <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <span className="font-mono tabular-nums">r{layout.revision}</span>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <RelativeTime at={layout.updatedAt} now={now} />
        </div>
      </div>
      {actions ? (
        <div className="relative z-10 -mt-1 -mr-1.5 shrink-0 self-start opacity-0 transition-opacity group-focus-within/layout:opacity-100 group-hover/layout:opacity-100 group-data-selected/layout:opacity-100 has-aria-expanded:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
