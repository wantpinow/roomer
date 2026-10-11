"use client"

import { ApertureIcon } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@roomer/ui/components/empty-state"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { RenderCard, type RenderSummary } from "./render-card"
import { RenderLightbox } from "./render-lightbox"

/**
 * The layout's renders, newest first, in a grid that adapts to its column
 * (one up in the inspector, more on wider pages). Clicking a finished render
 * opens the lightbox. `renders === undefined` means loading.
 */
export function RenderGallery({
  renders,
  now,
  className,
}: {
  renders: readonly RenderSummary[] | undefined
  now?: number
  className?: string
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (renders === undefined)
    return <RenderGallerySkeleton className={className} />

  if (renders.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<ApertureIcon />}
        title="No renders yet"
        description="Ask the agent for a view from one of the room's cameras — clay first, then photoreal."
      />
    )
  }

  const viewable = renders.filter((r) => r.status === "done")
  const index = viewable.findIndex((r) => r.id === openId)
  const open = index === -1 ? null : (viewable[index] ?? null)
  const step = (delta: number) => {
    const next = viewable[(index + delta + viewable.length) % viewable.length]
    if (next) setOpenId(next.id)
  }
  const many = viewable.length > 1

  return (
    <div data-slot="render-gallery" className={cn("@container", className)}>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-6 p-4 @md:grid-cols-2 @3xl:grid-cols-3">
        {renders.map((render) => (
          <li key={render.id}>
            <RenderCard render={render} onOpen={setOpenId} now={now} />
          </li>
        ))}
      </ul>
      <RenderLightbox
        render={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenId(null)
        }}
        onPrevious={many ? () => step(-1) : undefined}
        onNext={many ? () => step(1) : undefined}
        now={now}
      />
    </div>
  )
}

function RenderGallerySkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy
      aria-label="Loading renders"
      className={cn("flex flex-col gap-6 p-4", className)}
    >
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <Skeleton className="aspect-[3/2] w-full" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      ))}
    </div>
  )
}
