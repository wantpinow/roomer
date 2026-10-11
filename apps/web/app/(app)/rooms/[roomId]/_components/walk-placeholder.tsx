import { FootprintsIcon } from "lucide-react"

import { Kbd } from "@roomer/ui/components/kbd"

/** Stage content for Walk mode until the first-person viewer lands. */
export function WalkPlaceholder() {
  return (
    <div className="flex size-full items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-popover px-8 py-9 text-center shadow-float">
        <span className="flex size-11 items-center justify-center rounded-full border border-clay/20 bg-clay-tint text-clay">
          <FootprintsIcon className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="font-display text-xl leading-tight text-foreground">
            Walk through the room
          </p>
          <p className="text-ui leading-relaxed text-muted-foreground">
            Soon you&apos;ll stroll around this layout at eye height — a
            six-foot walker who bumps into the furniture and can hop over the
            rug.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>W</Kbd>
            <Kbd>A</Kbd>
            <Kbd>S</Kbd>
            <Kbd>D</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Space</Kbd> jump
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd> stop
          </span>
        </div>
        <p className="eyebrow">Coming soon</p>
      </div>
    </div>
  )
}
