import { LayersIcon } from "lucide-react"

import { EmptyState } from "@roomer/ui/components/empty-state"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { LayoutCard, type LayoutSummary } from "./layout-card"
import { sortLayouts } from "./sort-layouts"

/**
 * The layouts rail. Active layouts first (favourites, then candidates, then
 * drafts — most recently changed first within each), archived ones tucked
 * under their own heading. `layouts === undefined` means loading.
 */
export function LayoutList({
  layouts,
  selectedId,
  onSelect,
  renderActions,
  now,
  className,
}: {
  layouts: readonly LayoutSummary[] | undefined
  selectedId?: string
  onSelect?: (id: string) => void
  /** Per-card actions, e.g. a <LayoutActionsMenu>. */
  renderActions?: (layout: LayoutSummary) => React.ReactNode
  now?: number
  className?: string
}) {
  if (layouts === undefined) return <LayoutListSkeleton className={className} />

  if (layouts.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<LayersIcon />}
        title="No layouts yet"
        description="Ask the agent to propose one — “try the sofa facing the window” is a fine start."
      />
    )
  }

  const { active, archived } = sortLayouts(layouts)
  const renderCard = (layout: LayoutSummary) => (
    <li key={layout.id}>
      <LayoutCard
        layout={layout}
        selected={layout.id === selectedId}
        onSelect={onSelect}
        actions={renderActions?.(layout)}
        now={now}
      />
    </li>
  )

  return (
    <div data-slot="layout-list" className={cn("flex flex-col p-2", className)}>
      <ul className="flex flex-col gap-0.5">{active.map(renderCard)}</ul>
      {archived.length > 0 ? (
        <section aria-label="Archived layouts" className="mt-4">
          <h3 className="px-3 pb-1.5 eyebrow">Archived</h3>
          <ul className="flex flex-col gap-0.5">{archived.map(renderCard)}</ul>
        </section>
      ) : null}
    </div>
  )
}

function LayoutListSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy
      aria-label="Loading layouts"
      className={cn("flex flex-col gap-1 p-2", className)}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 px-3 py-2.5">
          <Skeleton className="h-3.5 w-3/5" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  )
}
