import { ScrollArea } from "@roomer/ui/components/scroll-area"
import { cn } from "@roomer/ui/lib/utils"

/**
 * Chrome for a rail: a small-caps title row with optional actions, a
 * scrolling body and an optional pinned footer.
 */
export function RailPanel({
  title,
  count,
  actions,
  footer,
  children,
  className,
}: {
  title: React.ReactNode
  count?: number
  actions?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="rail-panel"
      className={cn("flex h-full min-h-0 flex-col", className)}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pr-3 pl-4 in-data-[slot=sheet-content]:pr-12">
        <h2 className="flex items-baseline gap-1.5 eyebrow text-ink-soft">
          {title}
          {count !== undefined ? (
            <span className="font-mono text-muted-foreground tabular-nums">
              {count}
            </span>
          ) : null}
        </h2>
        {actions ? (
          <div className="ml-auto flex items-center gap-1">{actions}</div>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">{children}</ScrollArea>
      {footer ? (
        <div className="shrink-0 border-t border-border">{footer}</div>
      ) : null}
    </div>
  )
}
