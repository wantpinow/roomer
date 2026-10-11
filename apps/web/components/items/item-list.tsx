"use client"

import { ArmchairIcon } from "lucide-react"

import { EmptyState } from "@roomer/ui/components/empty-state"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { Price } from "@/components/common/price"
import { totalPrice } from "@/lib/format/price"

import { ItemRow, type PlacedItem } from "./item-row"

/**
 * The layout's furniture, with a footer that totals the price (GBP) and
 * counts the pieces. `items === undefined` means loading.
 */
export function ItemList({
  items,
  selectedId,
  onSelect,
  onHover,
  className,
}: {
  items: readonly PlacedItem[] | undefined
  selectedId?: string
  onSelect?: (placementId: string) => void
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

  return (
    <div data-slot="item-list" className={cn("flex flex-col", className)}>
      <ul className="flex flex-col p-2">
        {items.map((item) => (
          <li key={item.placement.id}>
            <ItemRow
              item={item}
              selected={item.placement.id === selectedId}
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
