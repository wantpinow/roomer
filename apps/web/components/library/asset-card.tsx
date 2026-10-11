"use client"

import type { AssetSpec } from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

import { Dims } from "@/components/common/dimension"
import { ImageFrame } from "@/components/common/image-frame"
import { Price } from "@/components/common/price"

import { CATEGORY_LABELS } from "./asset-labels"

/** A library asset as cards and the detail panel show it. */
export type AssetSummary = Pick<
  AssetSpec,
  "name" | "category" | "mount" | "dims" | "product" | "description"
> & {
  id: string
  /** Human key slug, e.g. castlery-auburn-3-seater-sofa-chalk-boucle. */
  key?: string
  /** Primary product image (cutout preferred). */
  imageUrl?: string
  /** Up to three reference photos, primary first. */
  referenceImages?: readonly string[]
}

/**
 * A product on its plinth: cutout image, name, variant, size and price.
 * Selecting it opens the detail panel.
 */
export function AssetCard({
  asset,
  selected = false,
  onSelect,
  className,
}: {
  asset: AssetSummary
  selected?: boolean
  onSelect?: (id: string) => void
  className?: string
}) {
  const product = asset.product
  return (
    <button
      type="button"
      data-slot="asset-card"
      data-asset-id={asset.id}
      aria-pressed={onSelect ? selected : undefined}
      onClick={() => onSelect?.(asset.id)}
      className={cn(
        "group/asset flex w-full flex-col gap-3 rounded-lg p-2 pb-3 text-left transition-colors outline-none",
        "hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/45",
        selected && "bg-card shadow-hairline ring-1 ring-border",
        className
      )}
    >
      <ImageFrame
        src={asset.imageUrl}
        alt={asset.name}
        tone="cutout"
        ratio="4/3"
        imageClassName="transition-transform duration-700 ease-out-soft group-hover/asset:scale-[1.03]"
        placeholder={<CategoryPlaceholder category={asset.category} />}
      />
      <span className="flex flex-col gap-1 px-1">
        <span className="flex items-baseline gap-3">
          <span className="line-clamp-1 text-ui font-medium text-foreground">
            {asset.name}
          </span>
          <Price
            amount={product?.price}
            currency={product?.currency}
            className="ml-auto shrink-0 text-ui text-ink-soft"
          />
        </span>
        {product?.variant ? (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {product.variant}
          </span>
        ) : null}
        <span className="flex items-center gap-2 pt-1 text-2xs text-muted-foreground">
          <span className="eyebrow text-[10px]">
            {CATEGORY_LABELS[asset.category]}
          </span>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <Dims dims={asset.dims} />
        </span>
      </span>
    </button>
  )
}

/** For pieces without a photo yet: the category, set like a plinth label. */
export function CategoryPlaceholder({
  category,
}: {
  category: AssetSummary["category"]
}) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="font-display text-xl text-faint italic dark:text-muted-foreground">
        {CATEGORY_LABELS[category]}
      </span>
      <span className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        No photo yet
      </span>
    </span>
  )
}
