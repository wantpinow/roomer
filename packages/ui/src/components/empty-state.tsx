import * as React from "react"
import { cn } from "@roomer/ui/lib/utils"

/**
 * A quiet placeholder for an empty list: an optional icon in a soft ring, a
 * serif title, a line of explanation and an optional action.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "default",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  /** `positive` tints the icon sage (e.g. "no issues"). */
  tone?: "default" | "positive"
}) {
  return (
    <div
      data-slot="empty-state"
      data-tone={tone}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className
      )}
      {...props}
    >
      {icon ? (
        <div
          aria-hidden
          className={cn(
            "flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground [&_svg:not([class*='size-'])]:size-[18px]",
            tone === "positive" && "border-sage/25 bg-sage-tint text-sage"
          )}
        >
          {icon}
        </div>
      ) : null}
      <div className="flex max-w-64 flex-col gap-1">
        <p className="font-heading text-base leading-snug text-foreground">
          {title}
        </p>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
