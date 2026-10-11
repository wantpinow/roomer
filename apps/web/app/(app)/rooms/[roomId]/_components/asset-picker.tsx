"use client"

import { useQuery } from "convex-helpers/react/cache"
import { SearchIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { api } from "@roomer/backend/convex/_generated/api"
import { zAssetCategory, type AssetCategory } from "@roomer/core/schema"
import { Button } from "@roomer/ui/components/button"
import { Input } from "@roomer/ui/components/input"
import { Kbd } from "@roomer/ui/components/kbd"
import { ScrollArea } from "@roomer/ui/components/scroll-area"
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@roomer/ui/components/segmented-control"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { Dims } from "@/components/common/dimension"
import { ImageFrame } from "@/components/common/image-frame"
import { Price } from "@/components/common/price"
import { CATEGORY_LABELS } from "@/components/library/asset-labels"
import { FootprintGlyph } from "@/components/plan/footprint-glyph"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { AssetRow } from "@/lib/workspace/types"

/** What the picker hands back for an asset: enough to start placing it. */
export type PickerAsset = Pick<
  AssetRow,
  | "_id"
  | "name"
  | "category"
  | "mount"
  | "dims"
  | "product"
  | "primaryImageUrl"
  | "footprint"
>

type SourceFilter = "all" | "library" | "custom"

/** MIME type for dragging an asset from the picker onto the plan. */
export const ASSET_DRAG_TYPE = "application/x-roomer-asset"

// A transparent drag image: the plan draws its own ghost.
let blankDragImage: HTMLImageElement | null = null
function dragImage(): HTMLImageElement {
  if (!blankDragImage) {
    blankDragImage = new Image()
    blankDragImage.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
  }
  return blankDragImage
}

/**
 * The add-item palette: a quiet panel docked in the stage. Search (debounced
 * `assets.search`, or the full list), filter by category and source, then
 * click a piece to place it — or drag it straight onto the plan. Recently
 * placed pieces come first.
 */
export function AssetPicker({
  recentIds,
  onPick,
  onDragStart,
  onDragEnd,
  onClose,
  className,
}: {
  recentIds: readonly string[]
  onPick: (asset: PickerAsset) => void
  onDragStart: (asset: PickerAsset) => void
  /** The drag ended: `dropped` when it landed on the plan. */
  onDragEnd: (dropped: boolean) => void
  onClose: () => void
  className?: string
}) {
  const [text, setText] = useState("")
  const [category, setCategory] = useState<AssetCategory | null>(null)
  const [source, setSource] = useState<SourceFilter>("all")
  const query = useDebouncedValue(text.trim(), 180)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const filters = {
    ...(category ? { category } : {}),
    ...(source !== "all" ? { source } : {}),
  }
  const searched = useQuery(
    api.assets.search,
    query ? { query, ...filters, limit: 60 } : "skip"
  )
  const listed = useQuery(api.assets.list, query ? "skip" : filters)
  const rows = query ? searched : listed
  const recent =
    !query && rows
      ? recentIds.flatMap((id) => rows.filter((row) => row._id === id))
      : []
  const rest = rows?.filter((row) => !recent.includes(row)) ?? []

  const row = (asset: PickerAsset) => (
    <li key={asset._id}>
      <PickerRow
        asset={asset}
        onPick={() => onPick(asset)}
        onDragStart={(event) => {
          event.dataTransfer.setData(ASSET_DRAG_TYPE, asset._id)
          event.dataTransfer.setData("text/plain", asset.name)
          event.dataTransfer.effectAllowed = "copy"
          event.dataTransfer.setDragImage(dragImage(), 0, 0)
          onDragStart(asset)
        }}
        onDragEnd={(event) =>
          onDragEnd(event.dataTransfer.dropEffect !== "none")
        }
      />
    </li>
  )

  return (
    <section
      data-slot="asset-picker"
      aria-label="Add an item"
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-pop motion-safe:animate-rise",
        className
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="flex items-center gap-2 border-b border-border py-2.5 pr-2 pl-4">
        <h2 className="font-display text-base leading-none text-foreground">
          Add an item
        </h2>
        <span className="ml-auto flex items-center gap-1 text-2xs text-muted-foreground">
          <Kbd>A</Kbd>
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close the item picker"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </header>

      <div className="flex flex-col gap-2.5 border-b border-border p-3">
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search furniture"
            placeholder="Search furniture…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              const first = recent[0] ?? rest[0]
              if (event.key === "Enter" && first) {
                event.preventDefault()
                onPick(first)
              }
            }}
            className="pl-8"
          />
        </div>
        <SegmentedControl<SourceFilter>
          aria-label="Source"
          value={source}
          onValueChange={setSource}
          className="w-full [&>*]:flex-1"
        >
          <SegmentedControlItem value="all">All</SegmentedControlItem>
          <SegmentedControlItem value="library">Starter</SegmentedControlItem>
          <SegmentedControlItem value="custom">Yours</SegmentedControlItem>
        </SegmentedControl>
        <div
          role="group"
          aria-label="Category"
          className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]"
        >
          {[null, ...zAssetCategory.options].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "h-6 shrink-0 rounded-full border px-2.5 text-2xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                category === c
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-ink-soft hover:bg-accent"
              )}
            >
              {c ? CATEGORY_LABELS[c] : "All"}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {rows === undefined ? (
          <div
            aria-busy
            aria-label="Loading furniture"
            className="flex flex-col gap-1 p-2"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="size-11 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-ui text-muted-foreground">
            {query || category || source !== "all"
              ? "Nothing matches. Try another name or clear the filters."
              : "The library is empty. Give the agent a product link to add a piece."}
          </p>
        ) : (
          <div className="flex flex-col py-1.5">
            {recent.length > 0 ? (
              <>
                <h3 className="px-4 pt-1.5 pb-1 eyebrow">Recent</h3>
                <ul className="flex flex-col px-1.5">{recent.map(row)}</ul>
                <h3 className="px-4 pt-3 pb-1 eyebrow">Everything</h3>
              </>
            ) : null}
            <ul className="flex flex-col px-1.5">{rest.map(row)}</ul>
          </div>
        )}
      </ScrollArea>
      <footer className="border-t border-border px-4 py-2 text-2xs leading-relaxed text-muted-foreground">
        Click to place, or drag onto the plan.
      </footer>
    </section>
  )
}

function PickerRow({
  asset,
  onPick,
  onDragStart,
  onDragEnd,
}: {
  asset: PickerAsset
  onPick: () => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd: (event: React.DragEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      draggable
      data-slot="picker-asset"
      data-asset-id={asset._id}
      onClick={onPick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group/pick flex w-full cursor-grab items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors outline-none hover:bg-sunken/60 focus-visible:ring-2 focus-visible:ring-ring/45 active:cursor-grabbing"
    >
      {asset.primaryImageUrl ? (
        <ImageFrame
          src={asset.primaryImageUrl}
          alt=""
          tone="cutout"
          ratio="1"
          className="w-11 shrink-0 rounded-md"
        />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-sunken p-1.5">
          <FootprintGlyph rings={asset.footprint} className="size-full" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 truncate text-ui font-medium text-foreground">
            {asset.name}
          </span>
          {asset.product?.price !== undefined ? (
            <Price
              amount={asset.product.price}
              currency={asset.product.currency}
              className="ml-auto shrink-0 text-xs text-ink-soft"
            />
          ) : null}
        </span>
        <span className="flex items-center gap-1.5 truncate text-2xs text-muted-foreground">
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
