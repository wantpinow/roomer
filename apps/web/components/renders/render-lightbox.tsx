"use client"

import { ChevronLeftIcon, ChevronRightIcon, SplitIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@roomer/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@roomer/ui/components/dialog"
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@roomer/ui/components/segmented-control"
import { Toggle } from "@roomer/ui/components/toggle"

import { RelativeTime } from "@/components/common/relative-time"
import { formatDuration, modelLabel } from "@/lib/format/render"

import { CompareSlider } from "./compare-slider"
import type { RenderSummary } from "./render-card"

type Pass = "photo" | "clay" | "id"

/**
 * A render at full size. Switch between the photoreal image and the clay /
 * id passes it came from, or turn on "Compare to clay" for a wipe between
 * clay and photoreal. ← / → step through the gallery.
 */
export function RenderLightbox({
  render,
  onOpenChange,
  onPrevious,
  onNext,
  now,
}: {
  /** The render to show; null closes the lightbox. */
  render: RenderSummary | null
  onOpenChange: (open: boolean) => void
  onPrevious?: () => void
  onNext?: () => void
  now?: number
}) {
  return (
    <Dialog open={render !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(1120px,calc(100vw-3rem))] gap-0 overflow-hidden p-0 sm:max-w-[min(1120px,calc(100vw-3rem))]"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" && onPrevious) onPrevious()
          if (event.key === "ArrowRight" && onNext) onNext()
        }}
      >
        {render ? (
          // Keyed so pass/compare state resets per render.
          <LightboxBody
            key={render.id}
            render={render}
            onPrevious={onPrevious}
            onNext={onNext}
            now={now}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function LightboxBody({
  render,
  onPrevious,
  onNext,
  now,
}: {
  render: RenderSummary
  onPrevious?: () => void
  onNext?: () => void
  now?: number
}) {
  const [pass, setPass] = useState<Pass>("photo")
  const [compare, setCompare] = useState(false)
  const title = render.cameraName ?? "Render"
  const model = render.model ? modelLabel(render.model) : null
  const canCompare = Boolean(render.imageUrl && render.clayUrl)
  const sources: Record<Pass, string | undefined> = {
    photo: render.imageUrl,
    clay: render.clayUrl,
    id: render.idUrl,
  }
  const src = sources[pass]

  return (
    <>
      <div className="relative bg-[#1b1916]" style={{ aspectRatio: "3/2" }}>
        {compare && render.imageUrl && render.clayUrl ? (
          <CompareSlider
            before={render.clayUrl}
            after={render.imageUrl}
            beforeLabel="Clay"
            afterLabel="Photoreal"
          />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element -- see ImageFrame
          <img
            src={src}
            alt={`${pass === "photo" ? "Photoreal render" : pass === "clay" ? "Clay pass" : "ID pass"} from ${title}`}
            className="absolute inset-0 size-full object-contain"
          />
        ) : null}
        {onPrevious ? (
          <NavButton side="left" label="Previous render" onClick={onPrevious} />
        ) : null}
        {onNext ? (
          <NavButton side="right" label="Next render" onClick={onNext} />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border px-6 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 text-xs">
            {model ? (
              <span>
                {model.provider ? `${model.provider} · ` : null}
                <span className="font-mono">{model.name}</span>
              </span>
            ) : null}
            {render.durationMs !== undefined ? (
              <span>· {formatDuration(render.durationMs)}</span>
            ) : null}
            <span>
              · <RelativeTime at={render.createdAt} now={now} />
            </span>
          </DialogDescription>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!compare ? (
            <SegmentedControl<Pass>
              aria-label="Pass"
              value={pass}
              onValueChange={setPass}
            >
              <SegmentedControlItem value="photo" disabled={!render.imageUrl}>
                Photoreal
              </SegmentedControlItem>
              <SegmentedControlItem value="clay" disabled={!render.clayUrl}>
                Clay
              </SegmentedControlItem>
              <SegmentedControlItem value="id" disabled={!render.idUrl}>
                ID
              </SegmentedControlItem>
            </SegmentedControl>
          ) : null}
          <Toggle
            variant="outline"
            size="sm"
            pressed={compare}
            onPressedChange={setCompare}
            disabled={!canCompare}
            className="data-[state=on]:border-clay/30 data-[state=on]:bg-clay-tint data-[state=on]:text-clay"
          >
            <SplitIcon />
            Compare to clay
          </Toggle>
        </div>
      </div>
    </>
  )
}

function NavButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right"
  label: string
  onClick: () => void
}) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon
  // Centred by a wrapper: Button nudges itself with translate-y while
  // pressed, which would undo a -translate-y-1/2 on the button mid-click
  // and drop the click.
  return (
    <div
      className={`absolute top-1/2 z-10 -translate-y-1/2 ${side === "left" ? "left-3" : "right-3"}`}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={onClick}
        className="rounded-full bg-black/35 text-white hover:bg-black/55 hover:text-white"
      >
        <Icon />
      </Button>
    </div>
  )
}
