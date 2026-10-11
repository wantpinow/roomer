import { cn } from "@roomer/ui/lib/utils"
import { Stat, StatLabel, StatValue } from "@roomer/ui/components/stat"

import { formatArea, formatExtent } from "@/lib/format/length"

import { Dimension } from "./dimension"

export interface RoomStatsValue {
  /** Overall plan extent (bounding box), mm. */
  widthMm: number
  depthMm: number
  /** Floor area, mm². */
  areaMm2: number
  ceilingHeightMm?: number
  wallCount?: number
}

/**
 * A room's headline numbers as a title-block row: extent, floor area,
 * ceiling height and wall count, separated by hairlines.
 */
export function RoomStats({
  stats,
  className,
}: {
  stats: RoomStatsValue
  className?: string
}) {
  const items: { key: string; label: string; value: React.ReactNode }[] = [
    {
      key: "extent",
      label: "Extent",
      value: formatExtent(stats.widthMm, stats.depthMm),
    },
    { key: "floor", label: "Floor", value: formatArea(stats.areaMm2) },
  ]
  if (stats.ceilingHeightMm !== undefined) {
    items.push({
      key: "ceiling",
      label: "Ceiling",
      value: <Dimension mm={stats.ceilingHeightMm} />,
    })
  }
  if (stats.wallCount !== undefined) {
    items.push({ key: "walls", label: "Walls", value: stats.wallCount })
  }
  return (
    <dl
      data-slot="room-stats"
      className={cn(
        "flex items-stretch divide-x divide-border [&>*]:px-4 [&>*:first-child]:pl-0 [&>*:last-child]:pr-0",
        className
      )}
    >
      {items.map((item) => (
        <Stat key={item.key} data-stat={item.key}>
          <StatLabel asChild>
            <dt>{item.label}</dt>
          </StatLabel>
          <StatValue asChild>
            <dd>{item.value}</dd>
          </StatValue>
        </Stat>
      ))}
    </dl>
  )
}
