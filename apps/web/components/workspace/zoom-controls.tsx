"use client"

import { MinusIcon, PlusIcon, ScanIcon } from "lucide-react"

import { Button } from "@roomer/ui/components/button"
import { Separator } from "@roomer/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@roomer/ui/components/tooltip"

import { FloatingBar } from "./stage"

/** Zoom out · 100% · zoom in | fit — bottom-right of the stage. */
export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  /** Current scale, 1 = 100%. Omit to hide the readout. */
  zoom?: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}) {
  return (
    <FloatingBar role="toolbar" aria-label="Zoom">
      <IconAction label="Zoom out" onClick={onZoomOut}>
        <MinusIcon />
      </IconAction>
      {zoom !== undefined ? (
        <output
          aria-label="Zoom level"
          className="w-11 text-center font-mono text-2xs text-muted-foreground tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </output>
      ) : null}
      <IconAction label="Zoom in" onClick={onZoomIn}>
        <PlusIcon />
      </IconAction>
      <Separator orientation="vertical" className="mx-0.5 my-1.5" />
      <IconAction label="Fit to view" onClick={onFit}>
        <ScanIcon />
      </IconAction>
    </FloatingBar>
  )
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className="rounded-full"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
