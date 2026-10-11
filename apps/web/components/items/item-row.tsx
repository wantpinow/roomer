"use client"

import type { AssetSpec, Placement } from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

import { Dims } from "@/components/common/dimension"
import { ImageFrame } from "@/components/common/image-frame"
import { Price } from "@/components/common/price"
import { formatPosition, type ItemPosition } from "@/lib/format/position"
import { elevationBadge } from "@/lib/plan-edit/elevation"

/** One placed item, joined with the bits of its asset the list shows. */
export interface PlacedItem {
  placement: Placement
  asset: Pick<AssetSpec, "name" | "category" | "dims"> & {
    price?: number
    currency?: string
    /** Primary product image (cutout preferred). */
    imageUrl?: string
  }
  /** Wall-relative readout; falls back to the plan coordinates. */
  position?: ItemPosition
}

/**
 * One row of the items list: product thumbnail, label/name, size, price and
 * a position readout. Hover/focus asks the viewer to highlight it.
 */
export function ItemRow({
  item,
  selected = false,
  onSelect,
  onHover,
  className,
}: {
  item: PlacedItem
  selected?: boolean
  /** A click; `toggle` when Shift is held (add to / take out of a group). */
  onSelect?: (placementId: string, options: { toggle: boolean }) => void
  onHover?: (placementId: string | null) => void
  className?: string
}) {
  const { placement, asset } = item
  const title = placement.label ?? asset.name
  const id = placement.id
  return (
    <button
      type="button"
      data-slot="item-row"
      data-placement-id={id}
      aria-pressed={onSelect ? selected : undefined}
      onClick={(event) => onSelect?.(id, { toggle: event.shiftKey })}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(id)}
      onBlur={() => onHover?.(null)}
      className={cn(
        "group/item relative flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors outline-none",
        "hover:bg-sunken/50 focus-visible:ring-2 focus-visible:ring-ring/45",
        "before:absolute before:inset-y-2.5 before:left-0 before:w-[2px] before:rounded-full before:bg-clay-fill before:opacity-0 before:transition-opacity",
        selected && "bg-sunken/60 before:opacity-100 hover:bg-sunken/60",
        className
      )}
    >
      <ImageFrame
        src={asset.imageUrl}
        alt=""
        tone="cutout"
        ratio="1"
        className="w-12 shrink-0 rounded-sm"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-ui font-medium text-foreground">
            {title}
          </span>
          <Price
            amount={asset.price}
            currency={asset.currency}
            className="ml-auto shrink-0 text-ui text-ink-soft"
          />
        </span>
        {placement.label ? (
          <span className="truncate text-xs text-muted-foreground">
            {asset.name}
          </span>
        ) : null}
        <span className="flex items-center gap-2 text-2xs text-muted-foreground">
          <Dims dims={asset.dims} />
        </span>
        <span className="truncate font-mono text-2xs text-muted-foreground">
          {formatPosition(item.position, placement)}
          {placement.elevation > 0 ? (
            <span data-slot="item-elevation">
              {" · "}
              {elevationBadge(placement.elevation)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  )
}
