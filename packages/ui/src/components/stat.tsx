import * as React from "react"
import { cn } from "@roomer/ui/lib/utils"
import { Slot } from "radix-ui"

/**
 * A labelled figure in the manner of a drawing's title block: a small-caps
 * label above a tabular value. Compose with StatLabel / StatValue / StatUnit;
 * label and value take `asChild` so they can be a <dt>/<dd> pair.
 */
function Stat({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stat"
      className={cn("flex min-w-0 flex-col gap-0.5", className)}
      {...props}
    />
  )
}

function StatLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="stat-label"
      className={cn("truncate eyebrow", className)}
      {...props}
    />
  )
}

function StatValue({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="stat-value"
      className={cn(
        "truncate text-ui font-medium text-foreground tabular-nums",
        className
      )}
      {...props}
    />
  )
}

function StatUnit({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="stat-unit"
      className={cn("ml-0.5 font-normal text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Stat, StatLabel, StatValue, StatUnit }
