"use client"

import { BoxIcon, CameraIcon, PencilRulerIcon } from "lucide-react"

import { Kbd } from "@roomer/ui/components/kbd"
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@roomer/ui/components/segmented-control"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@roomer/ui/components/tooltip"

import { useHotkey } from "./use-hotkey"

export const VIEW_MODES = [
  { value: "plan", label: "Plan", hotkey: "P", Icon: PencilRulerIcon },
  { value: "3d", label: "3D", hotkey: "3", Icon: BoxIcon },
  { value: "camera", label: "Camera", hotkey: "C", Icon: CameraIcon },
] as const

export type ViewMode = (typeof VIEW_MODES)[number]["value"]

/**
 * Plan / 3D / Camera — the stage's floating mode switch. Single-key
 * shortcuts (P, 3, C) work anywhere outside a text field.
 */
export function ViewModeControl({
  value,
  onValueChange,
  hotkeys = true,
  className,
}: {
  value: ViewMode
  onValueChange: (mode: ViewMode) => void
  hotkeys?: boolean
  className?: string
}) {
  useHotkey("p", () => onValueChange("plan"), hotkeys)
  useHotkey("3", () => onValueChange("3d"), hotkeys)
  useHotkey("c", () => onValueChange("camera"), hotkeys)

  return (
    <SegmentedControl<ViewMode>
      aria-label="View"
      value={value}
      onValueChange={onValueChange}
      appearance="floating"
      className={className}
    >
      {VIEW_MODES.map(({ value: mode, label, hotkey, Icon }) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <SegmentedControlItem
              value={mode}
              aria-label={label}
              className="h-7 gap-1.5"
            >
              <Icon />
              <span>{label}</span>
            </SegmentedControlItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {label} view <Kbd>{hotkey}</Kbd>
          </TooltipContent>
        </Tooltip>
      ))}
    </SegmentedControl>
  )
}
