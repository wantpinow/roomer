"use client"

import { ArrowUpRightIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@roomer/ui/components/button"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { Dims } from "@/components/common/dimension"
import { ImageFrame } from "@/components/common/image-frame"
import { Price } from "@/components/common/price"
import { formatArea, formatExtent } from "@/lib/format/length"

import type { AssetSummary } from "./asset-card"
import {
  CATEGORY_LABELS,
  DIMS_SOURCE_LABELS,
  MOUNT_LABELS,
} from "./asset-labels"

/**
 * An asset in full: large image with its reference photos as a strip, the
 * name in the display face, retailer and variant, price, a spec sheet and a
 * link to the product page. `asset === undefined` means loading.
 */
export function AssetDetail({
  asset,
  actions,
  className,
}: {
  asset: AssetSummary | undefined
  /** Extra actions beside the product link (e.g. "Place in layout"). */
  actions?: React.ReactNode
  className?: string
}) {
  if (asset === undefined) return <AssetDetailSkeleton className={className} />
  // Keyed so the chosen image resets when the asset changes.
  return (
    <AssetDetailBody
      key={asset.id}
      asset={asset}
      actions={actions}
      className={className}
    />
  )
}

function AssetDetailBody({
  asset,
  actions,
  className,
}: {
  asset: AssetSummary
  actions?: React.ReactNode
  className?: string
}) {
  const images = asset.referenceImages?.length
    ? asset.referenceImages
    : asset.imageUrl
      ? [asset.imageUrl]
      : []
  const [active, setActive] = useState(0)
  const current = images[active] ?? asset.imageUrl
  const product = asset.product

  const specs: { label: string; value: React.ReactNode }[] = [
    {
      label: "Size",
      value: (
        <span className="flex flex-col">
          <Dims dims={asset.dims} />
          {product ? (
            <span className="text-2xs text-muted-foreground">
              W × D × H, {DIMS_SOURCE_LABELS[product.dimsSource]}
            </span>
          ) : null}
        </span>
      ),
    },
    { label: "Footprint", value: <FootprintValue dims={asset.dims} /> },
    { label: "Category", value: CATEGORY_LABELS[asset.category] },
    { label: "Mount", value: MOUNT_LABELS[asset.mount] },
  ]
  if (asset.key) {
    specs.push({
      label: "Key",
      value: (
        <code className="font-mono text-2xs text-ink-soft">{asset.key}</code>
      ),
    })
  }

  return (
    <article
      data-slot="asset-detail"
      data-asset-id={asset.id}
      className={cn("flex flex-col gap-6", className)}
    >
      <div className="flex flex-col gap-2">
        <ImageFrame
          src={current}
          alt={asset.name}
          tone={active === 0 ? "cutout" : "photo"}
          ratio="4/3"
          className="rounded-lg"
        />
        {images.length > 1 ? (
          <div
            role="group"
            aria-label="Reference images"
            className="flex gap-2"
          >
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-pressed={i === active}
                onClick={() => setActive(i)}
                className={cn(
                  "w-16 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                  "opacity-70 ring-1 ring-transparent transition hover:opacity-100",
                  i === active && "opacity-100 ring-clay-fill"
                )}
              >
                <ImageFrame
                  src={src}
                  alt=""
                  tone={i === 0 ? "cutout" : "photo"}
                  ratio="1"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <header className="flex flex-col gap-1.5">
        {product?.retailer ? (
          <p className="eyebrow">{product.retailer}</p>
        ) : null}
        <h2 className="font-display text-2xl leading-tight font-normal tracking-[-0.015em] text-foreground">
          {asset.name}
        </h2>
        {product?.variant ? (
          <p className="text-ui text-muted-foreground">{product.variant}</p>
        ) : null}
        <Price
          amount={product?.price}
          currency={product?.currency}
          className="pt-1 font-display text-xl text-foreground"
        />
      </header>

      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 border-t border-border text-ui">
        {specs.map((spec) => (
          <div
            key={spec.label}
            className="col-span-2 grid grid-cols-subgrid border-b border-border py-2.5"
          >
            <dt className="pt-0.5 eyebrow">{spec.label}</dt>
            <dd className="text-foreground">{spec.value}</dd>
          </div>
        ))}
      </dl>

      {asset.description ? (
        <p className="text-ui leading-relaxed text-ink-soft">
          {asset.description}
        </p>
      ) : null}

      {product || actions ? (
        <div className="flex flex-wrap gap-2">
          {product ? (
            <Button variant="outline" asChild>
              <a href={product.url} target="_blank" rel="noreferrer noopener">
                View product
                <ArrowUpRightIcon data-icon="inline-end" />
              </a>
            </Button>
          ) : null}
          {actions}
        </div>
      ) : null}
    </article>
  )
}

function FootprintValue({ dims }: { dims: AssetSummary["dims"] }) {
  return (
    <span className="tabular-nums">
      {formatExtent(dims.w, dims.d)}
      <span className="text-muted-foreground">
        {" "}
        · {formatArea(dims.w * dims.d)}
      </span>
    </span>
  )
}

function AssetDetailSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy
      aria-label="Loading asset"
      className={cn("flex flex-col gap-6", className)}
    >
      <Skeleton className="aspect-[4/3] w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  )
}
