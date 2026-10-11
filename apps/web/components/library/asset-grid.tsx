"use client"

import { SofaIcon } from "lucide-react"

import { EmptyState } from "@roomer/ui/components/empty-state"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { AssetCard, type AssetSummary } from "./asset-card"

/**
 * The library as a gallery of product cards that fills whatever width it's
 * given. `assets === undefined` means loading.
 */
export function AssetGrid({
  assets,
  selectedId,
  onSelect,
  className,
}: {
  assets: readonly AssetSummary[] | undefined
  selectedId?: string
  onSelect?: (id: string) => void
  className?: string
}) {
  if (assets === undefined) return <AssetGridSkeleton className={className} />

  if (assets.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<SofaIcon />}
        title="The library is empty"
        description="Give the agent a product link — it reads the dimensions, builds a model and adds it here."
      />
    )
  }

  return (
    <ul
      data-slot="asset-grid"
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-x-3 gap-y-4",
        className
      )}
    >
      {assets.map((asset) => (
        <li key={asset.id}>
          <AssetCard
            asset={asset}
            selected={asset.id === selectedId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  )
}

function AssetGridSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy
      aria-label="Loading library"
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-x-3 gap-y-4",
        className
      )}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex flex-col gap-3 p-2">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  )
}
