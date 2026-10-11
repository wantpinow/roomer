"use client"

import * as React from "react"
import { cn } from "@roomer/ui/lib/utils"

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@roomer/ui/components/toggle-group"

/**
 * A single-choice pill switch (Plan / 3D / Camera) built on ToggleGroup.
 * Unlike a raw single ToggleGroup it can't be emptied: clicking the active
 * option is a no-op, so there is always exactly one value.
 *
 * `inset` (default) is a sunken track with a raised pebble, for use on a
 * surface; `floating` is a raised pill with a sunken pebble, for use over
 * the stage.
 */
function SegmentedControl<TValue extends string>({
  value,
  onValueChange,
  appearance = "inset",
  className,
  size = "sm",
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof ToggleGroup>,
  "type" | "value" | "defaultValue" | "onValueChange" | "variant" | "spacing"
> & {
  value: TValue
  onValueChange: (value: TValue) => void
  appearance?: "inset" | "floating"
}) {
  return (
    <ToggleGroup
      data-slot="segmented-control"
      data-appearance={appearance}
      type="single"
      variant="segmented"
      spacing={0.5}
      size={size}
      value={value}
      onValueChange={(next: string) => {
        // Radix reports "" when the active item is clicked again; ignore it.
        if (next) onValueChange(next as TValue)
      }}
      className={cn(
        "group/segmented",
        appearance === "floating" &&
          "border border-border p-1 shadow-float data-[variant=segmented]:bg-popover",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroup>
  )
}

function SegmentedControlItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupItem>) {
  return (
    <ToggleGroupItem
      data-slot="segmented-control-item"
      className={cn(
        "px-3 group-data-[appearance=floating]/segmented:data-[state=on]:bg-sunken group-data-[appearance=floating]/segmented:data-[state=on]:shadow-none dark:group-data-[appearance=floating]/segmented:data-[state=on]:bg-accent",
        className
      )}
      {...props}
    />
  )
}

export { SegmentedControl, SegmentedControlItem }
