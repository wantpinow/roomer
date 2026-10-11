"use client"

import { useState } from "react"

import { cn } from "@roomer/ui/lib/utils"

/**
 * Before/after wipe: `after` fills the frame, `before` is revealed from the
 * left up to the handle. Driven by a native range input, so it works with
 * keyboard (arrows, Home/End) and screen readers.
 */
export function CompareSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
  className,
}: {
  before: string
  after: string
  beforeLabel: string
  afterLabel: string
  className?: string
}) {
  const [split, setSplit] = useState(50)
  return (
    <div
      data-slot="compare-slider"
      className={cn("relative size-full select-none", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- see ImageFrame */}
      <img
        src={after}
        alt={afterLabel}
        draggable={false}
        className="absolute inset-0 size-full object-contain"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- see ImageFrame */}
      <img
        src={before}
        alt={beforeLabel}
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        className="absolute inset-0 size-full object-contain"
      />
      <div
        aria-hidden
        style={{ left: `${split}%` }}
        className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgb(0_0_0/0.08)]"
      >
        <span className="absolute top-1/2 left-1/2 flex h-8 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[3px] rounded-full bg-white shadow-float">
          <span className="h-3 w-px bg-[#a39a8d]" />
          <span className="h-3 w-px bg-[#a39a8d]" />
        </span>
      </div>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/45 px-2 py-0.5 text-2xs font-medium text-white">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/45 px-2 py-0.5 text-2xs font-medium text-white">
        {afterLabel}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        aria-label={`${beforeLabel} / ${afterLabel} split`}
        className="peer absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-ring/45 peer-focus-visible:ring-2"
      />
    </div>
  )
}
