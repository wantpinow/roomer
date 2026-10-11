import type { Point } from "./angles"
import { containsPoint, segmentsIntersect } from "./polygon"
import { add, cross, distance, dot, scale, sub } from "./vec"

// Distances between points, segments and polygons on the plan, plus ray
// casting against a polygon outline.

/** Shortest distance from point p to segment ab. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a)
  const lengthSq = dot(ab, ab)
  if (lengthSq === 0) return distance(p, a)
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lengthSq))
  return distance(p, add(a, scale(ab, t)))
}

/** Shortest distance between segments ab and cd (0 when they touch). */
export function segmentDistance(
  a: Point,
  b: Point,
  c: Point,
  d: Point
): number {
  if (segmentsIntersect(a, b, c, d)) return 0
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b)
  )
}

/**
 * Shortest distance from a polygon (as a filled area) to segment ab: 0 when
 * the segment touches or enters the polygon.
 */
export function polygonSegmentDistance(
  polygon: readonly Point[],
  a: Point,
  b: Point
): number {
  if (polygon.length === 0) return Infinity
  if (polygon.length >= 3 && containsPoint(polygon, a)) return 0
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!
    const q = polygon[(i + 1) % polygon.length]!
    best = Math.min(best, segmentDistance(p, q, a, b))
    if (best === 0) return 0
  }
  return best
}

/**
 * First point where a ray from `origin` along `direction` crosses the
 * polygon's outline, ignoring hits closer than `minDistance` (so a ray that
 * starts on the outline doesn't hit itself). Undefined if it never does.
 */
export function rayPolygonHit(
  polygon: readonly Point[],
  origin: Point,
  direction: Point,
  minDistance = 1e-6
): { point: Point; distance: number } | undefined {
  let best: { point: Point; distance: number } | undefined
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const edge = sub(b, a)
    const denom = cross(direction, edge)
    if (Math.abs(denom) < 1e-12) continue // parallel
    const rel = sub(a, origin)
    const t = cross(rel, edge) / denom // along the ray
    const u = cross(rel, direction) / denom // along the edge, 0..1
    if (u < -1e-9 || u > 1 + 1e-9) continue
    const along = t * Math.hypot(direction[0], direction[1])
    if (along < minDistance) continue
    if (!best || along < best.distance) {
      best = { point: add(origin, scale(direction, t)), distance: along }
    }
  }
  return best
}

/** Area-weighted centroid of a simple polygon (vertex mean if degenerate). */
export function polygonCentroid(polygon: readonly Point[]): Point {
  let twiceArea = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < polygon.length; i++) {
    const [x0, z0] = polygon[i]!
    const [x1, z1] = polygon[(i + 1) % polygon.length]!
    const k = x0 * z1 - x1 * z0
    twiceArea += k
    cx += (x0 + x1) * k
    cz += (z0 + z1) * k
  }
  if (Math.abs(twiceArea) < 1e-9) {
    const n = Math.max(1, polygon.length)
    const sum = polygon.reduce<Point>((acc, p) => add(acc, p), [0, 0])
    return [sum[0] / n, sum[1] / n]
  }
  return [cx / (3 * twiceArea), cz / (3 * twiceArea)]
}
