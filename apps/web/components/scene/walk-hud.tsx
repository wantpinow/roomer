"use client"

import { cn } from "@roomer/ui/lib/utils"

export type WalkMode = "idle" | "keys" | "locked"

export const WALK_HINT =
  "Click to walk · WASD · Space to jump · Shift to run · Esc to exit"

/**
 * The walk view's overlay: a crosshair while walking and the controls hint
 * (bottom centre, clear of a host's top-centre controls). Bumps are silent.
 */
export function WalkHud({ mode }: { mode: WalkMode }) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {mode !== "idle" ? (
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2"
        >
          <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-ink/60" />
          <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-ink/60" />
        </div>
      ) : null}
      <p
        className={cn(
          "absolute bottom-4 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md border border-hairline bg-surface/85 px-3 py-1.5 text-center text-xs whitespace-nowrap text-ink-soft shadow-sm transition-opacity duration-300",
          mode === "locked" && "opacity-60"
        )}
      >
        {WALK_HINT}
        {mode === "keys" ? " · Q/E to turn" : ""}
      </p>
    </div>
  )
}
