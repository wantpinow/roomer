"use client"

import { useQuery } from "convex-helpers/react/cache"
import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"

import { api } from "@roomer/backend/convex/_generated/api"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { cn } from "@roomer/ui/lib/utils"

import { LintCounts } from "@/components/common/lint-counts"
import { RelativeTime } from "@/components/common/relative-time"
import { RoomStats } from "@/components/common/room-stats"
import { LayoutStatusChip } from "@/components/layouts/layout-status-chip"
import { sortLayouts } from "@/components/layouts/sort-layouts"
import { RoomOutline } from "@/components/plan/room-outline"
import { planFootprints } from "@/lib/workspace/footprints"
import type { RoomRow } from "@/lib/workspace/types"
import { roomStats } from "@/lib/workspace/view-models"

/**
 * One room: its outline drawn on drafting paper, the figures in a title
 * block, and its layouts — best first — with their lint tallies. The whole
 * card opens the workspace.
 */
export function RoomCard({ room, wide }: { room: RoomRow; wide: boolean }) {
  const detail = useQuery(api.rooms.get, { roomId: room._id })
  const layouts = useQuery(api.layouts.listByRoom, { roomId: room._id })
  const { active, archived } = sortLayouts(layouts ?? [])
  // Sketch the best layout's furniture into the drawing.
  const best = active[0]
  const bestDetail = useQuery(
    api.layouts.get,
    best ? { layoutId: best._id } : "skip"
  )
  const footprints = bestDetail
    ? planFootprints(bestDetail.placements, bestDetail.assets)
    : []
  const finishes = [
    { label: "Walls", value: detail?.finishes.walls },
    { label: "Floor", value: detail?.finishes.floor },
  ].filter((f): f is { label: string; value: string } => Boolean(f.value))
  const notes = detail?.finishes.notes
  const stats = roomStats({
    shell: { corners: room.corners },
    ceilingHeight: detail?.ceilingHeight ?? 0,
  })

  return (
    <Link
      href={`/rooms/${room._id}`}
      data-room-id={room._id}
      className={cn(
        "group/room grid overflow-hidden rounded-xl border border-border bg-card shadow-hairline transition-[box-shadow,border-color] duration-300 outline-none hover:border-rule hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring/45",
        wide
          ? "min-[900px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]"
          : "grid-rows-[auto_1fr]"
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center border-border bg-background bg-drafting p-10",
          wide
            ? "min-h-[420px] border-b min-[900px]:border-r min-[900px]:border-b-0"
            : "h-64 border-b"
        )}
      >
        <RoomOutline
          corners={room.corners}
          features={detail?.features}
          footprints={footprints}
          title={`Outline of ${room.name}`}
          className="h-full max-h-[460px] w-full transition-transform duration-700 ease-out-soft group-hover/room:scale-[1.02]"
        />
        <span className="absolute bottom-4 left-5 font-mono text-2xs text-muted-foreground">
          {best ? `${best.name} · ` : ""}
          {room.featureCount} features
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-7 p-8">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Room</span>
          <h2 className="font-display text-[2rem] leading-tight font-normal tracking-[-0.02em] text-foreground">
            {room.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            Updated <RelativeTime at={room.updatedAt} />
          </p>
        </div>

        <div className="border-y border-border py-4">
          {detail === undefined ? (
            <Skeleton className="h-9 w-3/4" />
          ) : (
            <RoomStats stats={stats} />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Layouts</span>
            <span className="font-mono text-2xs text-muted-foreground tabular-nums">
              {layouts === undefined
                ? "…"
                : `${active.length} active${archived.length ? ` · ${archived.length} archived` : ""}`}
            </span>
          </div>
          {layouts === undefined ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : active.length === 0 ? (
            <p className="text-ui text-muted-foreground">
              No layouts yet — ask the agent to propose one.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {active.slice(0, wide ? 4 : 3).map((layout) => (
                <li
                  key={layout._id}
                  className="flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-ui text-foreground">
                    {layout.name}
                  </span>
                  <LayoutStatusChip status={layout.status} />
                  <LintCounts
                    counts={layout.lintCounts}
                    className="w-24 justify-end"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {finishes.length > 0 || notes ? (
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Finishes</span>
            {finishes.length > 0 ? (
              <dl className="grid grid-cols-[4rem_1fr] gap-y-1 text-ui">
                {finishes.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="text-ink-soft">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {notes ? (
              <p className="max-w-[56ch] pt-1 font-display text-[0.9375rem] leading-snug text-ink-soft italic">
                {notes}
              </p>
            ) : null}
          </div>
        ) : null}

        <span className="mt-auto inline-flex items-center gap-1.5 self-start text-ui font-medium text-foreground">
          Open workspace
          <ArrowRightIcon className="size-4 text-clay transition-transform duration-300 ease-out-soft group-hover/room:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
