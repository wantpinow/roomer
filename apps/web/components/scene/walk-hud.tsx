"use client"

import { cn } from "@roomer/ui/lib/utils"
import type { MouseEvent, PointerEvent, ReactNode } from "react"

import {
  formatEyeHeight,
  formatStature,
  type WalkerSize,
} from "@/lib/walk/stature"

export type WalkMode = "idle" | "keys" | "locked"

export const WALK_HINT =
  "Click to walk · WASD · Space to jump · Shift to run · Esc to exit"

/** Keeps a HUD control's clicks from capturing the mouse or the focus. */
const hudControl = {
  onPointerDown: (event: PointerEvent) => event.stopPropagation(),
  onMouseDown: (event: MouseEvent) => event.preventDefault(),
}

function HudButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      {...hudControl}
      className="grid size-6 place-items-center rounded-sm text-ink hover:bg-sunken disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/**
 * The walk view's overlay: a crosshair while walking, the controls hint
 * (bottom centre, clear of a host's top-centre controls; hidden on narrow
 * stages) and the walker's height setting (bottom left). Bumps are silent.
 */
export function WalkHud({
  mode,
  player,
  onTaller,
  onShorter,
  canGrow,
  canShrink,
}: {
  mode: WalkMode
  player: WalkerSize
  onTaller: () => void
  onShorter: () => void
  canGrow: boolean
  canShrink: boolean
}) {
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
      <div
        role="group"
        aria-label="Walker height"
        data-walk-stature={player.height}
        className="pointer-events-auto absolute bottom-4 left-4 flex items-center gap-0.5 rounded-md border border-hairline bg-surface/85 p-1 text-xs text-ink-soft shadow-sm"
      >
        <HudButton
          label="Shorter by an inch (−)"
          onClick={onShorter}
          disabled={!canShrink}
        >
          <span aria-hidden>−</span>
        </HudButton>
        <span className="px-1.5 tabular-nums">
          Height{" "}
          <span className="text-ink">{formatStature(player.height)}</span>
          {" · "}eyes {formatEyeHeight(player.eyeHeight)}
        </span>
        <HudButton
          label="Taller by an inch (=)"
          onClick={onTaller}
          disabled={!canGrow}
        >
          <span aria-hidden>+</span>
        </HudButton>
      </div>
      <p
        className={cn(
          "absolute bottom-4 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md border border-hairline bg-surface/85 px-3 py-1.5 text-center text-xs whitespace-nowrap text-ink-soft shadow-sm transition-opacity duration-300 @max-2xl:hidden",
          mode === "locked" && "opacity-60"
        )}
      >
        {WALK_HINT}
        {mode === "keys" ? " · Q/E to turn" : ""}
      </p>
    </div>
  )
}
