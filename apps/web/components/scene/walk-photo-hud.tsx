"use client"

import { cn } from "@roomer/ui/lib/utils"
import type { MouseEvent, PointerEvent } from "react"

import type { WalkPhoto } from "@/lib/walk/photo"

/** Keeps a HUD control's clicks from capturing the mouse or the focus. */
const hudControl = {
  onPointerDown: (event: PointerEvent) => event.stopPropagation(),
  onMouseDown: (event: MouseEvent) => event.preventDefault(),
}

export interface WalkNote {
  text: string
  tone: "info" | "error"
}

/**
 * Walk mode's camera feedback, in every state: the shutter flash, a short
 * note ("Photo taken — rendering…") and, when a photo has rendered, a
 * thumbnail (bottom right) that opens it.
 */
export function WalkPhotoHud({
  flashing,
  note,
  ready,
  onOpen,
}: {
  /** The white shutter flash is up. */
  flashing: boolean
  note: WalkNote | null
  /** A finished photo to show as a thumbnail. */
  ready: WalkPhoto | null
  /** Open a finished photo in the host (else its image opens in a tab). */
  onOpen?: (photo: WalkPhoto) => void
}) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-white transition-opacity ease-out",
          flashing ? "opacity-80 duration-0" : "opacity-0 duration-500"
        )}
      />
      <div className="pointer-events-none absolute right-4 bottom-4 flex flex-col items-end gap-2">
        {ready?.url ? (
          <a
            href={ready.url}
            target="_blank"
            rel="noreferrer"
            data-walk-photo-ready={ready.id}
            {...hudControl}
            onClick={(event) => {
              event.stopPropagation()
              if (onOpen) {
                event.preventDefault()
                onOpen(ready)
              }
            }}
            className="pointer-events-auto block w-44 overflow-hidden rounded-md border border-hairline bg-surface shadow-md transition-transform hover:-translate-y-0.5"
          >
            {/* The render's own URL from Convex storage; no layout shift to manage. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ready.url}
              alt="The photo you took, rendered"
              className="block aspect-[3/2] w-full object-cover"
            />
            <span className="block px-2 py-1 text-xs text-ink-soft">
              Photo ready · open
            </span>
          </a>
        ) : null}
        <p
          role="status"
          aria-live="polite"
          data-walk-note={note ? note.tone : undefined}
          className={cn(
            "rounded-md border border-hairline bg-surface/90 px-3 py-1.5 text-xs shadow-sm transition-opacity duration-300",
            note ? "opacity-100" : "opacity-0",
            note?.tone === "error" ? "text-error" : "text-ink"
          )}
        >
          {note?.text ?? ""}
        </p>
      </div>
    </>
  )
}
