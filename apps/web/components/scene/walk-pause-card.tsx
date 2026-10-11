"use client"

import { Button } from "@roomer/ui/components/button"
import { Kbd } from "@roomer/ui/components/kbd"
import {
  BookmarkPlusIcon,
  CameraIcon,
  FootprintsIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react"
import { useId } from "react"

import {
  formatEyeHeight,
  formatStature,
  type WalkerSize,
} from "@/lib/walk/stature"

/**
 * The card over a paused walk: everything that needs a cursor. Resume
 * (focused, so Enter resumes), the walker's height, take a photo of the
 * held view, save it as a viewpoint, or leave for the plan.
 */
export function WalkPauseCard({
  started,
  player,
  canGrow,
  canShrink,
  onTaller,
  onShorter,
  onResume,
  onPhoto,
  onSaveView,
  onExit,
}: {
  /** Has walked already ("Paused") or not yet ("Click to start walking"). */
  started: boolean
  player: WalkerSize
  canGrow: boolean
  canShrink: boolean
  onTaller: () => void
  onShorter: () => void
  onResume: () => void
  onPhoto?: () => void
  onSaveView?: () => void
  onExit: () => void
}) {
  const titleId = useId()
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-walk-pause-card={started ? "paused" : "start"}
      // Clicks on the card stay on the card (a click on the scrim resumes).
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className="w-[min(22rem,calc(100%-2rem))] rounded-xl border border-hairline bg-surface/95 p-5 text-ink shadow-lg"
    >
      <h2
        id={titleId}
        className="font-display text-2xl leading-tight font-normal tracking-[-0.015em]"
      >
        {started ? "Paused" : "Click to start walking"}
      </h2>
      <p className="mt-1.5 text-ui text-ink-soft">
        {started
          ? "Your view is held right where you stopped."
          : "WASD or the arrows to move, the mouse to look, Space to jump, Shift to run."}
      </p>

      <Button
        // Lands focus here when the walk pauses: Enter resumes.
        autoFocus
        variant="clay"
        className="mt-4 w-full"
        onClick={onResume}
        data-walk-resume
      >
        <FootprintsIcon data-icon="inline-start" />
        {started ? "Resume walking" : "Start walking"}
      </Button>

      <div
        role="group"
        aria-label="Walker height"
        className="mt-4 flex items-center justify-between gap-2 rounded-md border border-hairline bg-sunken/60 p-1"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Shorter by an inch (−)"
          title="Shorter by an inch (−)"
          disabled={!canShrink}
          onClick={onShorter}
        >
          <MinusIcon />
        </Button>
        <span
          className="text-ui text-ink-soft tabular-nums"
          data-walk-stature={player.height}
        >
          Height{" "}
          <span className="text-ink">{formatStature(player.height)}</span>
          {" · "}eyes {formatEyeHeight(player.eyeHeight)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Taller by an inch (=)"
          title="Taller by an inch (=)"
          disabled={!canGrow}
          onClick={onTaller}
        >
          <PlusIcon />
        </Button>
      </div>

      {onPhoto || onSaveView ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {onPhoto ? (
            <Button variant="outline" size="sm" onClick={onPhoto}>
              <CameraIcon data-icon="inline-start" />
              Take photo
            </Button>
          ) : null}
          {onSaveView ? (
            <Button variant="outline" size="sm" onClick={onSaveView}>
              <BookmarkPlusIcon data-icon="inline-start" />
              Save viewpoint
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit to plan
        </Button>
        <Kbd>Esc</Kbd>
      </div>
    </div>
  )
}
