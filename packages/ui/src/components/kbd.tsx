import * as React from "react"
import { cn } from "@roomer/ui/lib/utils"

/** A keycap, e.g. <Kbd>P</Kbd> or <Kbd>⌘</Kbd>. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-border bg-card px-1 font-mono text-[10px] leading-none text-muted-foreground shadow-[inset_0_-1px_0_var(--border)] select-none",
        className
      )}
      {...props}
    />
  )
}

/** A run of keycaps for a chord, e.g. ⌘ K. */
function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-0.5", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
