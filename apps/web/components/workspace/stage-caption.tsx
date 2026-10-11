import { cn } from "@roomer/ui/lib/utils"

import { RoomStats, type RoomStatsValue } from "@/components/common/room-stats"

/**
 * The stage's title block, like the corner of an architectural drawing: room
 * and layout names on the left, the room's figures on the right, and an
 * optional trailing slot (revision, scale…).
 */
export function StageCaption({
  roomName,
  layoutName,
  stats,
  trailing,
  className,
}: {
  roomName: string
  layoutName?: string
  stats: RoomStatsValue
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="stage-caption"
      className={cn("@container flex h-14 items-center gap-6 px-5", className)}
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 font-display text-[1.0625rem] leading-none text-foreground">
          {roomName}
        </span>
        {layoutName ? (
          <>
            <span aria-hidden className="text-faint">
              /
            </span>
            <span className="truncate text-ui text-muted-foreground">
              {layoutName}
            </span>
          </>
        ) : null}
      </div>
      {/* Figures drop out as the stage narrows: walls, ceiling, then all. */}
      <RoomStats
        stats={stats}
        className="hidden shrink-0 @xl:flex [&_[data-stat=ceiling]]:hidden @3xl:[&_[data-stat=ceiling]]:flex [&_[data-stat=walls]]:hidden @4xl:[&_[data-stat=walls]]:flex"
      />
      {trailing ? (
        <div className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground @xl:border-l @xl:border-border @xl:pl-5">
          {trailing}
        </div>
      ) : null}
    </div>
  )
}
