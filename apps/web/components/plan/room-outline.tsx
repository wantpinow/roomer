import { bounds, deriveWalls, wallPoint } from "@roomer/core/geometry"
import type { Feature, Vec2 } from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

import { svgPoints, type PlanFootprint } from "@/lib/workspace/footprints"

/** Wall thickness drawn outside the plaster line, mm. */
const WALL_MM = 110

/**
 * The room shell as SVG in room millimetres: solid walls outside the plaster
 * line, the floor, and openings cut where doors and windows are (with a
 * glazing line in windows). Theme colours via classes.
 */
export function RoomShellSketch({
  corners,
  features = [],
}: {
  corners: readonly Vec2[]
  features?: readonly Feature[]
}) {
  const points = corners.map(([x, z]) => `${x},${z}`).join(" ")
  const walls = deriveWalls(corners)
  const openings = features.flatMap((feature) => {
    if (!("wall" in feature)) return []
    if (
      feature.type !== "door" &&
      feature.type !== "window" &&
      feature.type !== "opening"
    ) {
      return []
    }
    const wall = walls.find((w) => w.id === feature.wall)
    if (!wall) return []
    const outward = -WALL_MM / 2
    const [x1, z1] = wallPoint(wall, feature.offset, outward)
    const [x2, z2] = wallPoint(wall, feature.offset + feature.width, outward)
    return [{ id: feature.id, type: feature.type, x1, z1, x2, z2 }]
  })
  return (
    <g data-slot="room-shell-sketch">
      <polygon
        points={points}
        className="fill-ink stroke-ink"
        strokeWidth={WALL_MM * 2}
        strokeLinejoin="miter"
      />
      <polygon points={points} className="fill-surface" />
      {openings.map((o) => (
        <g key={o.id} data-feature-id={o.id}>
          <line
            x1={o.x1}
            y1={o.z1}
            x2={o.x2}
            y2={o.z2}
            className="stroke-surface"
            strokeWidth={WALL_MM + 30}
          />
          {o.type === "window" ? (
            <line
              x1={o.x1}
              y1={o.z1}
              x2={o.x2}
              y2={o.z2}
              className="stroke-info-fill"
              strokeWidth={34}
            />
          ) : null}
        </g>
      ))}
    </g>
  )
}

/** The viewBox that frames a room with room for its walls. */
export function roomViewBox(
  corners: readonly Vec2[],
  pad: number = WALL_MM * 2.5
): string {
  const box = bounds(corners)
  return [
    box.minX - pad,
    box.minZ - pad,
    box.maxX - box.minX + pad * 2,
    box.maxZ - box.minZ + pad * 2,
  ].join(" ")
}

/**
 * A room's outline as a small architectural drawing — the shell sketch with
 * (optionally) the furniture of a layout sketched in. Colours come from the
 * theme, so it works in light and dark without props.
 */
export function RoomOutline({
  corners,
  features = [],
  footprints = [],
  className,
  title,
}: {
  corners: readonly Vec2[]
  features?: readonly Feature[]
  /** Furniture to sketch in (ceiling items are left out). */
  footprints?: readonly PlanFootprint[]
  className?: string
  title?: string
}) {
  if (corners.length < 3) return null
  return (
    <svg
      viewBox={roomViewBox(corners)}
      role="img"
      aria-label={title ?? "Room outline"}
      className={cn("overflow-visible", className)}
    >
      <RoomShellSketch corners={corners} features={features} />
      <FootprintSketch footprints={footprints} />
    </svg>
  )
}

/** Furniture outlines: rugs dashed underneath, wall items dark, the rest sand. */
export function FootprintSketch({
  footprints,
}: {
  footprints: readonly PlanFootprint[]
}) {
  return (
    <g data-slot="footprint-sketch">
      {footprints
        .filter((f) => f.mount !== "ceiling")
        .sort((a, b) => rank(a) - rank(b))
        .map((f) => (
          <polygon
            key={f.id}
            points={svgPoints(f.outline)}
            className={cn(
              f.mount === "floor-covering"
                ? "fill-oak-tint/60 stroke-rule"
                : f.mount === "wall"
                  ? "fill-ink-soft stroke-ink-soft"
                  : "fill-oak-tint stroke-oak-fill"
            )}
            strokeWidth={f.mount === "floor-covering" ? 14 : 18}
            strokeDasharray={f.mount === "floor-covering" ? "70 50" : undefined}
            strokeLinejoin="round"
          />
        ))}
    </g>
  )
}

/** Rugs first, so furniture draws on top of them. */
function rank(footprint: PlanFootprint): number {
  return footprint.mount === "floor-covering" ? 0 : 1
}
