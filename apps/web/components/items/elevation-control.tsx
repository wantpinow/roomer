"use client"

import { ArrowDownToLineIcon, MinusIcon, PlusIcon } from "lucide-react"
import { useId, useState } from "react"

import { formatNumber } from "@roomer/core/geometry"
import { Button } from "@roomer/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@roomer/ui/components/tooltip"
import { cn } from "@roomer/ui/lib/utils"

import {
  LIFT_LARGE_MM,
  LIFT_MM,
  parseHeight,
  restLabel,
  type HeightKind,
  type SupportSurface,
} from "@/lib/plan-edit/elevation"

export interface ElevationControlProps {
  /** Floor items: "Height off floor"; wall items: "Height on wall"; ceiling items can't move. */
  kind: HeightKind
  /** The bottom's height (mm), or "mixed" for a group at several heights. */
  value: number | "mixed"
  /** A wall item's middle, shown beside the label. */
  centre?: number
  /** False when (the lowest of) the selection is on the floor. */
  canLower: boolean
  /** Offer "On the floor" (something standing is off it). */
  canFloor: boolean
  /** Surfaces the item could stand on, highest first. */
  supports?: readonly Pick<SupportSurface, "id" | "name" | "top" | "current">[]
  /** Raise (+) or lower (−) by mm. */
  onLift: (dy: number) => void
  /** Set every item's bottom to this height. */
  onSet: (elevation: number) => void
  /** While typing: the height to preview, null to stop. */
  onPreview?: (elevation: number | null) => void
  onFloor: () => void
  onRest: (supportId: string) => void
  className?: string
}

const CEILING_HINT = "Hangs from the ceiling — its drop is part of the asset"

/**
 * The selection's height: a millimetre field with −/+ steppers (10 mm,
 * Shift 100 mm; ↑/↓ in the field too), "On the floor", and "Rest on…" for
 * the surfaces beneath. Typing previews live and sets on Enter or blur;
 * Esc reverts.
 */
export function ElevationControl({
  kind,
  value,
  centre,
  canLower,
  canFloor,
  supports = [],
  onLift,
  onSet,
  onPreview,
  onFloor,
  onRest,
  className,
}: ElevationControlProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const fixed = kind === "ceiling"
  const shown = draft ?? (value === "mixed" || fixed ? "" : formatNumber(value))
  const parsed = draft === null ? null : parseHeight(draft)
  const invalid = draft !== null && draft.trim() !== "" && parsed === null
  // The middle follows a typed height (it's a fixed distance above the bottom).
  const shownCentre =
    centre !== undefined && value !== "mixed" && parsed !== null
      ? centre - value + parsed
      : centre

  const step = (event: { shiftKey: boolean }, sign: 1 | -1) =>
    onLift(sign * (event.shiftKey ? LIFT_LARGE_MM : LIFT_MM))

  const stop = () => {
    setDraft(null)
    onPreview?.(null)
  }
  const commit = () => {
    if (draft === null) return
    const next = parseHeight(draft)
    stop()
    if (next !== null && next !== value) onSet(next)
  }

  const field = (
    <div
      className={cn(
        "flex h-8 items-center rounded-md border border-input bg-card shadow-hairline transition-[border-color,box-shadow] focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/20",
        invalid && "border-error ring-2 ring-error/15",
        fixed && "bg-sunken opacity-60"
      )}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        className="ml-0.5 text-ink-soft"
        aria-label={`Lower ${LIFT_MM} mm (Shift: ${LIFT_LARGE_MM} mm)`}
        disabled={fixed || !canLower}
        onClick={(event) => step(event, -1)}
      >
        <MinusIcon />
      </Button>
      <input
        id={id}
        data-slot="elevation-input"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        disabled={fixed}
        value={shown}
        placeholder={value === "mixed" ? "mixed" : fixed ? "—" : "0"}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          const next = parseHeight(event.target.value)
          onPreview?.(next)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
          } else if (event.key === "Escape") {
            event.preventDefault()
            stop()
            event.currentTarget.blur()
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            if (draft !== null) stop()
            if (event.key === "ArrowUp") step(event, 1)
            else if (canLower) step(event, -1)
          }
        }}
        className="w-16 min-w-0 bg-transparent text-center font-mono text-ui text-foreground tabular-nums outline-none placeholder:font-sans placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
      <span aria-hidden className="text-2xs text-muted-foreground">
        mm
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="mr-0.5 text-ink-soft"
        aria-label={`Raise ${LIFT_MM} mm (Shift: ${LIFT_LARGE_MM} mm)`}
        disabled={fixed}
        onClick={(event) => step(event, 1)}
      >
        <PlusIcon />
      </Button>
    </div>
  )

  return (
    <div
      data-slot="elevation-control"
      data-kind={kind}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex items-baseline gap-2">
        <label htmlFor={id} className="eyebrow">
          {kind === "wall" ? "Height on wall" : "Height off floor"}
        </label>
        {shownCentre !== undefined ? (
          <span
            data-slot="elevation-centre"
            className="ml-auto font-mono text-2xs text-muted-foreground tabular-nums"
          >
            centre {formatNumber(shownCentre)} mm
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {fixed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                aria-label={CEILING_HINT}
                className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
              >
                {field}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{CEILING_HINT}</TooltipContent>
          </Tooltip>
        ) : (
          field
        )}
        {canFloor && !fixed ? (
          <Button variant="outline" size="xs" onClick={onFloor}>
            <ArrowDownToLineIcon data-icon="inline-start" />
            On the floor
          </Button>
        ) : null}
      </div>
      {supports.length > 0 && !fixed ? (
        <div className="flex flex-wrap gap-1.5">
          {supports.map((surface) => (
            <Button
              key={surface.id}
              data-slot="rest-on"
              data-support-id={surface.id}
              variant="outline"
              size="xs"
              disabled={surface.current}
              aria-pressed={surface.current}
              onClick={() => onRest(surface.id)}
              className="max-w-full aria-pressed:border-sage/30 aria-pressed:bg-sage-tint aria-pressed:text-sage aria-pressed:opacity-100"
            >
              <span className="truncate">
                {surface.current
                  ? `On ${surface.name} (${formatNumber(surface.top)} mm)`
                  : restLabel(surface)}
              </span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
