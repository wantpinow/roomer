"use client"

import { useQuery } from "convex-helpers/react/cache"
import { SearchIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { api } from "@roomer/backend/convex/_generated/api"
import { zAssetCategory, type AssetCategory } from "@roomer/core/schema"
import { Button } from "@roomer/ui/components/button"
import { Input } from "@roomer/ui/components/input"
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@roomer/ui/components/segmented-control"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@roomer/ui/components/toggle-group"

import { AssetGrid } from "@/components/library/asset-grid"
import { CATEGORY_LABELS } from "@/components/library/asset-labels"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useSearchParam } from "@/hooks/use-search-param"
import { toAssetSummary } from "@/lib/workspace/view-models"

const SOURCES = ["all", "library", "custom"] as const
type SourceFilter = (typeof SOURCES)[number]

/**
 * /library: every asset the agent can place, searchable by name and
 * filterable by category and source. Filters live in the URL.
 */
export function LibraryContent() {
  const router = useRouter()
  const [qParam, setQParam] = useSearchParam("q")
  const [categoryParam, setCategoryParam] = useSearchParam("category")
  const [sourceParam, setSourceParam] = useSearchParam("source")
  const [text, setText] = useState(qParam ?? "")
  const query = useDebouncedValue(text.trim(), 200)

  const category = zAssetCategory.safeParse(categoryParam).data
  const source: SourceFilter = SOURCES.find((s) => s === sourceParam) ?? "all"
  const filters = {
    ...(category ? { category } : {}),
    ...(source !== "all" ? { source } : {}),
  }
  const searched = useQuery(
    api.assets.search,
    query ? { query, ...filters, limit: 100 } : "skip"
  )
  const listed = useQuery(api.assets.list, query ? "skip" : filters)
  const rows = query ? searched : listed
  const assets = rows?.map(toAssetSummary)

  const updateSearch = (value: string) => {
    setText(value)
    setQParam(value.trim() || null)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-8 pt-14 pb-20 motion-safe:animate-rise">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-3">
          <span className="eyebrow">Library</span>
          <h1 className="font-display text-[2.75rem] leading-[1.04] font-normal tracking-[-0.025em] text-foreground">
            Furniture<span className="text-clay-fill">.</span>
          </h1>
          <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
            Everything the agent can place: products it built from a link, and
            the starter pieces. Sizes are the listing&apos;s, to the millimetre.
          </p>
        </div>
        <span className="font-mono text-2xs text-muted-foreground tabular-nums">
          {assets === undefined
            ? "…"
            : `${assets.length} ${assets.length === 1 ? "piece" : "pieces"}`}
        </span>
      </header>

      <div className="flex flex-col gap-4 border-y border-border py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-80">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search the library"
              placeholder="Search by name…"
              value={text}
              onChange={(event) => updateSearch(event.target.value)}
              className="pr-8 pl-8"
            />
            {text ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => updateSearch("")}
                className="absolute top-1/2 right-1 -translate-y-1/2"
              >
                <XIcon />
              </Button>
            ) : null}
          </div>
          <SegmentedControl<SourceFilter>
            aria-label="Source"
            value={source}
            onValueChange={(value) =>
              setSourceParam(value === "all" ? null : value)
            }
            className="ml-auto"
          >
            <SegmentedControlItem value="all">All</SegmentedControlItem>
            <SegmentedControlItem value="library">Starter</SegmentedControlItem>
            <SegmentedControlItem value="custom">Yours</SegmentedControlItem>
          </SegmentedControl>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={1}
          aria-label="Category"
          value={category ?? "all"}
          onValueChange={(value: string) => {
            const next: AssetCategory | undefined =
              zAssetCategory.safeParse(value).data
            setCategoryParam(next ?? null)
          }}
          className="flex-wrap"
        >
          <ToggleGroupItem value="all" className="rounded-full px-3">
            All
          </ToggleGroupItem>
          {zAssetCategory.options.map((c) => (
            <ToggleGroupItem key={c} value={c} className="rounded-full px-3">
              {CATEGORY_LABELS[c]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <AssetGrid
        assets={assets}
        onSelect={(id) => router.push(`/library/${id}`)}
        className="-mx-2"
        empty={
          query || category || source !== "all"
            ? {
                title: "Nothing matches",
                description: "Try another name, or clear the filters.",
              }
            : undefined
        }
      />
    </div>
  )
}
