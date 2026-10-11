"use client"

import { PanelLeftIcon, PanelRightIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@roomer/ui/components/button"
import { Kbd } from "@roomer/ui/components/kbd"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@roomer/ui/components/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@roomer/ui/components/tooltip"
import { cn } from "@roomer/ui/lib/utils"

import { useHotkey } from "./use-hotkey"
import { useMediaQuery } from "./use-media-query"

export const RAIL_WIDTH = 264
export const INSPECTOR_WIDTH = 340
/** Below this the rails leave the grid and open as sheets. */
export const WORKSPACE_WIDE_QUERY = "(min-width: 1100px)"

export interface WorkspaceFrameProps {
  /** Left rail: the layouts list. */
  rail: React.ReactNode
  railLabel?: string
  /** Centre: the viewer stage. */
  stage: React.ReactNode
  /** Right rail: the inspector tabs. */
  inspector: React.ReactNode
  inspectorLabel?: string
  defaultRailOpen?: boolean
  defaultInspectorOpen?: boolean
  className?: string
}

/**
 * The room workspace: layouts rail · stage · inspector. Rails collapse (the
 * corner buttons or `[` / `]`) and, below ~1100px, leave the grid to open as
 * sheets over the stage instead. Purely presentational: every region is a
 * slot.
 */
export function WorkspaceFrame({
  rail,
  railLabel = "Layouts",
  stage,
  inspector,
  inspectorLabel = "Inspector",
  defaultRailOpen = true,
  defaultInspectorOpen = true,
  className,
}: WorkspaceFrameProps) {
  const wide = useMediaQuery(WORKSPACE_WIDE_QUERY, true)
  const [railOpen, setRailOpen] = useState(defaultRailOpen)
  const [inspectorOpen, setInspectorOpen] = useState(defaultInspectorOpen)
  // Narrow screens start with both sheets closed, independent of the
  // docked state, so resizing back restores the docked layout.
  const [railSheet, setRailSheet] = useState(false)
  const [inspectorSheet, setInspectorSheet] = useState(false)

  const toggleRail = () =>
    wide ? setRailOpen((open) => !open) : setRailSheet((open) => !open)
  const toggleInspector = () =>
    wide
      ? setInspectorOpen((open) => !open)
      : setInspectorSheet((open) => !open)

  useHotkey("[", toggleRail)
  useHotkey("]", toggleInspector)

  const railShown = wide ? railOpen : railSheet
  const inspectorShown = wide ? inspectorOpen : inspectorSheet

  return (
    <div
      data-slot="workspace"
      data-layout={wide ? "docked" : "sheets"}
      className={cn(
        "grid h-full min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-300 ease-out-soft",
        className
      )}
      style={{
        gridTemplateColumns: wide
          ? `${railOpen ? RAIL_WIDTH : 0}px minmax(0, 1fr) ${inspectorOpen ? INSPECTOR_WIDTH : 0}px`
          : "minmax(0, 1fr)",
      }}
    >
      {wide ? (
        <aside
          aria-label={railLabel}
          data-open={railOpen}
          inert={!railOpen}
          className="min-h-0 min-w-0 overflow-hidden border-r border-border bg-sidebar data-[open=false]:border-r-0"
        >
          <div className="flex h-full flex-col" style={{ width: RAIL_WIDTH }}>
            {rail}
          </div>
        </aside>
      ) : null}

      <section
        aria-label="Viewer"
        className="relative flex min-h-0 min-w-0 flex-col"
      >
        {stage}
        <RailToggle
          side="left"
          label={
            railShown
              ? `Hide ${railLabel.toLowerCase()}`
              : `Show ${railLabel.toLowerCase()}`
          }
          hotkey="["
          pressed={railShown}
          onClick={toggleRail}
        />
        <RailToggle
          side="right"
          label={
            inspectorShown
              ? `Hide ${inspectorLabel.toLowerCase()}`
              : `Show ${inspectorLabel.toLowerCase()}`
          }
          hotkey="]"
          pressed={inspectorShown}
          onClick={toggleInspector}
        />
      </section>

      {wide ? (
        <aside
          aria-label={inspectorLabel}
          data-open={inspectorOpen}
          inert={!inspectorOpen}
          className="min-h-0 min-w-0 overflow-hidden border-l border-border bg-card data-[open=false]:border-l-0"
        >
          <div
            className="flex h-full flex-col"
            style={{ width: INSPECTOR_WIDTH }}
          >
            {inspector}
          </div>
        </aside>
      ) : (
        <>
          <Sheet open={railSheet} onOpenChange={setRailSheet}>
            <SheetContent
              side="left"
              className="gap-0 bg-sidebar p-0"
              style={{ width: RAIL_WIDTH + 24, maxWidth: "85vw" }}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{railLabel}</SheetTitle>
                <SheetDescription>Layouts for this room</SheetDescription>
              </SheetHeader>
              {rail}
            </SheetContent>
          </Sheet>
          <Sheet open={inspectorSheet} onOpenChange={setInspectorSheet}>
            <SheetContent
              side="right"
              className="gap-0 p-0"
              style={{ width: INSPECTOR_WIDTH + 24, maxWidth: "90vw" }}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{inspectorLabel}</SheetTitle>
                <SheetDescription>
                  Issues, items, activity and renders
                </SheetDescription>
              </SheetHeader>
              {inspector}
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  )
}

function RailToggle({
  side,
  label,
  hotkey,
  pressed,
  onClick,
}: {
  side: "left" | "right"
  label: string
  hotkey: string
  pressed: boolean
  onClick: () => void
}) {
  const Icon = side === "left" ? PanelLeftIcon : PanelRightIcon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn(
            "absolute top-3 z-20 border border-border bg-popover text-muted-foreground shadow-soft hover:bg-popover hover:text-foreground",
            side === "left" ? "left-3" : "right-3"
          )}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side === "left" ? "right" : "left"}>
        {label} <Kbd>{hotkey}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}
