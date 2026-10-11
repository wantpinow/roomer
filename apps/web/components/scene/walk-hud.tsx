"use client"

import { cn } from "@roomer/ui/lib/utils"

import {
  formatEyeHeight,
  formatStature,
  type WalkerSize,
} from "@/lib/walk/stature"

export const WALK_HINT =
  "Enter photo · Shift+Enter save view · −/= height · C sit · Z lie · Esc pause"

/**
 * The HUD while walking, kept minimal: a crosshair, a one-line hint (it
 * fades once you've read it and comes back when you press a key) and a
 * brief readout when the height changes.
 */
export function WalkingHud({
  hintActive,
  heightReadout,
  dragToLook,
  postureLabel,
}: {
  /** Show the hint at full strength (recently pressed a key). */
  hintActive: boolean
  /** Just changed height: what it is now. */
  heightReadout: WalkerSize | null
  /** Walking without pointer lock: mention drag-to-look and Q/E. */
  dragToLook: boolean
  /** "Sitting on Test three-seat sofa" while sitting or lying. */
  postureLabel: string | null
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 select-none"
      data-walk-hud
    >
      {/* Difference-blended so it reads on pale walls and dark wood alike. */}
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 opacity-80 mix-blend-difference"
      >
        <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-white" />
        <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-white" />
      </div>
      <p
        data-walk-hint
        className={cn(
          "absolute bottom-4 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 truncate rounded-md border border-hairline bg-surface/85 px-3 py-1.5 text-center text-xs text-ink-soft shadow-sm transition-opacity",
          hintActive ? "opacity-100 duration-200" : "opacity-25 duration-1000"
        )}
      >
        {WALK_HINT}
        {dragToLook ? " · drag or Q/E to turn" : ""}
      </p>
      <p
        data-walk-posture={postureLabel ?? undefined}
        className={cn(
          "absolute bottom-14 left-4 rounded-md border border-hairline bg-surface/90 px-3 py-1.5 text-xs text-ink shadow-sm transition-opacity duration-300",
          postureLabel ? "opacity-100" : "opacity-0"
        )}
      >
        {postureLabel ? (
          <>
            {postureLabel}
            <span className="text-ink-soft"> · Space to stand</span>
          </>
        ) : null}
      </p>
      <p
        role="status"
        aria-live="polite"
        data-walk-height-readout
        className={cn(
          "absolute bottom-4 left-4 rounded-md border border-hairline bg-surface/90 px-3 py-1.5 text-xs text-ink-soft tabular-nums shadow-sm transition-opacity duration-300",
          heightReadout ? "opacity-100" : "opacity-0"
        )}
      >
        {heightReadout ? (
          <>
            Height{" "}
            <span className="text-ink">
              {formatStature(heightReadout.height)}
            </span>
            {" · "}eyes {formatEyeHeight(heightReadout.eyeHeight)}
          </>
        ) : null}
      </p>
    </div>
  )
}
