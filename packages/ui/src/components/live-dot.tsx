import * as React from "react"
import { cn } from "@roomer/ui/lib/utils"

/**
 * A small status dot. `live` breathes a clay halo (motion-safe only) to say
 * "something is changing this right now".
 */
function LiveDot({
  live = false,
  tone = "clay",
  className,
  ...props
}: React.ComponentProps<"span"> & {
  live?: boolean
  tone?: "clay" | "sage" | "muted"
}) {
  return (
    <span
      data-slot="live-dot"
      data-live={live || undefined}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        tone === "clay" && "bg-clay-fill",
        tone === "sage" && "bg-sage-fill",
        tone === "muted" && "bg-faint",
        live && "motion-safe:animate-live",
        className
      )}
      {...props}
    />
  )
}

export { LiveDot }
