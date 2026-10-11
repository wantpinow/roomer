"use client"

import { ArmchairIcon } from "lucide-react"

import { Button } from "@roomer/ui/components/button"
import { EmptyState } from "@roomer/ui/components/empty-state"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { Price } from "@/components/common/price"
import { totalPrice } from "@/lib/format/price"

import { ItemRow, type PlacedItem } from "./item-row"

/**
 * The layout's furniture, with a footer that totals the price (GBP) and
 * counts the pieces. With a selection, a bar above the list names it (or
 * says how many and what they cost), with a Clear and the selection's
 * details (its height). Click selects a row, Shift+click toggles it.
 * `items === undefined` means loading.
 */
export function ItemList({
  items,
  selectedIds = [],
  onSelect,
  onClearSelection,
  selectionDetails,
  onHover,
  className,
}: {
  items: readonly PlacedItem[] | undefined
  selectedIds?: readonly string[]
  onSelect?: (placementId: string, options: { toggle: boolean }) => void
  onClearSelection?: () => void
  /** Shown under the selection bar (e.g. the height control). */
  selectionDetails?: React.ReactNode
  onHover?: (placementId: string | null) => void
  className?: string
}) {
  if (items === undefined) return <ItemListSkeleton className={className} />

  if (items.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<ArmchairIcon />}
        title="Nothing placed yet"
        description="Furniture the agent adds to this layout appears here, with sizes and prices."
      />
    )
  }

  const total = totalPrice(
    items.map((item) => ({
      price: item.asset.price,
      currency: item.asset.currency,
    }))
  )

  const selected = new Set(selectedIds)
  const picked = items.filter((item) => selected.has(item.placement.id))
  const pickedTotal = totalPrice(
    picked.map((item) => ({
      price: item.asset.price,
      currency: item.asset.currency,
    }))
  )

  return (
    <div data-slot="item-list" className={cn("flex flex-col", className)}>
      {picked.length > 0 ? (
        <div
          data-slot="item-selection"
          data-count={picked.length}
          className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border bg-clay-tint py-2 pr-2 pl-5 text-xs text-ink-soft"
        >
          <div className="flex items-center gap-2">
            {picked.length === 1 ? (
              <span className="truncate font-medium text-foreground">
                {picked[0]!.placement.label ?? picked[0]!.asset.name}
              </span>
            ) : (
              <span className="font-medium text-foreground tabular-nums">
                {picked.length} selected
              </span>
            )}
            {picked.length > 1 && pickedTotal.priced > 0 ? (
              <>
                <span aria-hidden className="text-faint">
                  ·
                </span>
                <Price
                  amount={pickedTotal.total}
                  currency={pickedTotal.currency}
                />
              </>
            ) : null}
            {onClearSelection ? (
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={onClearSelection}
              >
                Clear
              </Button>
            ) : null}
          </div>
          {selectionDetails ? (
            <div className="pr-3 pb-1.5">{selectionDetails}</div>
          ) : null}
        </div>
      ) : null}
      <ul className="flex flex-col p-2">
        {items.map((item) => (
          <li key={item.placement.id}>
            <ItemRow
              item={item}
              selected={selected.has(item.placement.id)}
              onSelect={onSelect}
              onHover={onHover}
            />
          </li>
        ))}
      </ul>
      <div
        data-slot="item-total"
        className="sticky bottom-0 mt-auto flex items-baseline gap-3 border-t border-border bg-card px-5 py-3.5"
      >
        <span className="eyebrow">Total</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {items.length} {items.length === 1 ? "item" : "items"}
          {total.unpriced > 0 ? ` · ${total.unpriced} unpriced` : null}
        </span>
        <Price
          amount={total.total}
          currency={total.currency}
          className="ml-auto font-display text-lg leading-none text-foreground"
        />
      </div>
    </div>
  )
}

function ItemListSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy
      aria-label="Loading items"
      className={cn("flex flex-col gap-1 p-2", className)}
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 px-3 py-2.5">
          <Skeleton className="size-12 rounded-sm" />
          <div className="flex flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
