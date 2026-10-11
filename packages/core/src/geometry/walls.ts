import type { Vec2, WallFeature, WallId } from "../schema"
import { bearingOf, type Point } from "./angles"
import { add, cross, dot, normalize, scale, sub } from "./vec"

// Walls derived from the room's corners. Wall Wi runs from corner Ci to
// Ci+1; its inward normal points into the room (corners are clockwise on the
// plan, so n = (−d.z, d.x)).

export interface Wall {
  id: WallId
  /** 0-based index into the corner list. */
  index: number
  startCorner: string
  endCorner: string
  start: Point
  end: Point
  length: number
  /** Unit direction start → end. */
  dir: Point
  /** Unit normal pointing into the room. */
  normal: Point
  /** Bearing of `normal` — the facing of an item with its back to this wall. */
  inwardBearing: number
}

export function wallId(index: number): WallId {
  return `W${index + 1}`
}

export function cornerId(index: number): string {
  return `C${index + 1}`
}

export function deriveWalls(corners: readonly Vec2[]): Wall[] {
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length]!
    const start: Point = [corner[0], corner[1]]
    const end: Point = [next[0], next[1]]
    const delta = sub(end, start)
    const dir = normalize(delta)
    const normal: Point = [-dir[1], dir[0]]
    return {
      id: wallId(index),
      index,
      startCorner: cornerId(index),
      endCorner: cornerId((index + 1) % corners.length),
      start,
      end,
      length: Math.hypot(delta[0], delta[1]),
      dir,
      normal,
      inwardBearing: bearingOf(normal),
    }
  })
}

export function findWall(walls: readonly Wall[], id: string): Wall | undefined {
  return walls.find((wall) => wall.id === id)
}

/** Point `along` mm from the wall's start, `inset` mm into the room. */
export function wallPoint(wall: Wall, along: number, inset = 0): Point {
  return add(add(wall.start, scale(wall.dir, along)), scale(wall.normal, inset))
}

/**
 * Express a plan point in a wall's frame: `along` from the start corner and
 * `inset` (signed distance into the room; negative = behind the wall).
 */
export function toWallFrame(
  wall: Wall,
  point: Point
): { along: number; inset: number } {
  const rel = sub(point, wall.start)
  return { along: dot(rel, wall.dir), inset: dot(rel, wall.normal) }
}

/** Plan footprint of a wall-attached feature that sticks out `depth` mm. */
export function wallFeatureFootprint(
  wall: Wall,
  feature: Pick<WallFeature, "offset" | "width">,
  depth: number
): Point[] {
  return [
    wallPoint(wall, feature.offset, 0),
    wallPoint(wall, feature.offset + feature.width, 0),
    wallPoint(wall, feature.offset + feature.width, depth),
    wallPoint(wall, feature.offset, depth),
  ]
}

/**
 * Interior angle at each corner, degrees. 90 for a square corner, 270 for a
 * reflex (inside) corner such as the notch of an L-shaped room.
 */
export function cornerAngles(corners: readonly Vec2[]): number[] {
  const n = corners.length
  return corners.map((_, i) => {
    const prev = corners[(i - 1 + n) % n]!
    const here = corners[i]!
    const next = corners[(i + 1) % n]!
    const incoming = normalize(sub([here[0], here[1]], [prev[0], prev[1]]))
    const outgoing = normalize(sub([next[0], next[1]], [here[0], here[1]]))
    const turn = Math.atan2(cross(incoming, outgoing), dot(incoming, outgoing))
    return 180 - (turn * 180) / Math.PI
  })
}
