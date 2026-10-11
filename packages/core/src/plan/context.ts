import type { Point } from "../geometry/angles"
import { bounds, type Bounds2 } from "../geometry/polygon"
import type { RoomGeometry } from "../geometry/room-geometry"
import { deriveWalls, type Wall } from "../geometry/walls"
import { cross, scale, sub, add } from "../geometry/vec"
import type { PlanTheme } from "./theme"

// Shared state for drawing one plan: the room, its walls and outer wall
// outline, sizes (all in mm, scaled to the room so a studio and a long
// through-room both read well) and the theme.

export interface PlanMetrics {
  /** Wall band thickness drawn outside the plaster line. */
  wall: number
  /** Item label size. */
  font: number
  /** Smallest label size before abbreviating. */
  minFont: number
  /** Feature ids, wall ids, corner ids. */
  small: number
  /** Dimension figures. */
  dim: number
  title: number
  /** Detail lines inside items, swing arcs. */
  hairline: number
  /** Item outlines. */
  stroke: number
  /** Gap between the wall band and the first label lane. */
  gap: number
  /** Height of one lane of feature labels outside a wall. */
  lane: number
}

export interface PlanContext {
  room: RoomGeometry
  walls: Wall[]
  polygon: Point[]
  bounds: Bounds2
  /** Mitred outer corner of the wall band at each room corner. */
  outer: Point[]
  metrics: PlanMetrics
  theme: PlanTheme
  /** Prefix for ids in <defs>, unique per plan on a page. */
  idPrefix: string
}

export const WALL_THICKNESS_MM = 100

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function planMetrics(box: Bounds2): PlanMetrics {
  const size = Math.max(box.maxX - box.minX, box.maxZ - box.minZ)
  const font = Math.round(clamp(size / 78, 60, 150))
  const small = Math.round(font * 0.62)
  return {
    wall: WALL_THICKNESS_MM,
    font,
    minFont: Math.round(font * 0.55),
    small,
    dim: Math.round(font * 0.72),
    title: Math.round(font * 1.5),
    hairline: Math.max(3, Math.round(font * 0.045)),
    stroke: Math.max(6, Math.round(font * 0.1)),
    gap: Math.round(small * 0.7),
    lane: Math.round(small * 1.45),
  }
}

/** Intersection of lines p + t·d and q + s·e (undefined when parallel). */
function lineIntersection(
  p: Point,
  d: Point,
  q: Point,
  e: Point
): Point | undefined {
  const denom = cross(d, e)
  if (Math.abs(denom) < 1e-9) return undefined
  const t = cross(sub(q, p), e) / denom
  return add(p, scale(d, t))
}

/** Outer corners of a band `thickness` wide outside every wall, mitred. */
export function outerCorners(walls: readonly Wall[], thickness: number) {
  const n = walls.length
  return walls.map((wall, i) => {
    const prev = walls[(i + n - 1) % n]!
    const fallback = sub(wall.start, scale(wall.normal, thickness))
    const hit = lineIntersection(
      sub(prev.start, scale(prev.normal, thickness)),
      prev.dir,
      fallback,
      wall.dir
    )
    // Very sharp corners would mitre far out; bevel them instead.
    if (!hit) return fallback
    const reach = Math.hypot(hit[0] - wall.start[0], hit[1] - wall.start[1])
    return reach > thickness * 4 ? fallback : hit
  })
}

export function planContext(
  room: RoomGeometry,
  theme: PlanTheme,
  idPrefix: string
): PlanContext {
  const walls = deriveWalls(room.corners)
  const polygon: Point[] = room.corners.map(([x, z]) => [x, z])
  const box = bounds(polygon)
  const metrics = planMetrics(box)
  return {
    room,
    walls,
    polygon,
    bounds: box,
    outer: outerCorners(walls, metrics.wall),
    metrics,
    theme,
    idPrefix,
  }
}
