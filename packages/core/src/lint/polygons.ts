import polygonClipping, { type MultiPolygon, type Ring } from "polygon-clipping"

import type { Point } from "../geometry/angles"
import { convexHull } from "../geometry/hull"
import {
  bounds,
  ensureClockwiseOnPlan,
  type Bounds2,
} from "../geometry/polygon"
import { add, cross, dot, scale, sub } from "../geometry/vec"

// Polygon operations for lint and the plan: intersections (fast
// Sutherland–Hodgman for the common convex case, polygon-clipping
// otherwise), differences, unions, the minimum width of an overlap and
// distances between outlines. Outlines are plain [x, z] rings without a
// repeated closing point.

const EPS = 1e-9

/** True when every turn of the outline goes the same way (or is straight). */
export function isConvex(polygon: readonly Point[]): boolean {
  const n = polygon.length
  if (n < 3) return false
  let sign = 0
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % n]!
    const c = polygon[(i + 2) % n]!
    const turn = cross(sub(b, a), sub(c, b))
    if (Math.abs(turn) < EPS) continue
    const s = Math.sign(turn)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return sign !== 0
}

/**
 * Clip `subject` to the convex polygon `clip` (Sutherland–Hodgman). Exact
 * when the subject is convex too; [] when they don't overlap.
 */
export function clipConvex(
  subject: readonly Point[],
  clip: readonly Point[]
): Point[] {
  const clipRing = ensureClockwiseOnPlan(clip)
  let output: Point[] = [...subject]
  for (let i = 0; i < clipRing.length && output.length > 0; i++) {
    const a = clipRing[i]!
    const edge = sub(clipRing[(i + 1) % clipRing.length]!, a)
    const side = (p: Point) => cross(edge, sub(p, a))
    const input = output
    output = []
    for (let j = 0; j < input.length; j++) {
      const current = input[j]!
      const previous = input[(j + input.length - 1) % input.length]!
      const sc = side(current)
      const sp = side(previous)
      if (sc >= -EPS) {
        if (sp < -EPS) output.push(cut(previous, current, sp, sc))
        output.push(current)
      } else if (sp >= -EPS) {
        output.push(cut(previous, current, sp, sc))
      }
    }
  }
  return output.length >= 3 && polygonArea(output) > EPS ? output : []
}

function cut(p: Point, q: Point, sp: number, sq: number): Point {
  const t = sp / (sp - sq)
  return add(p, scale(sub(q, p), t))
}

function toRing(polygon: readonly Point[]): Ring {
  return polygon.map(([x, z]) => [x, z])
}

/** Outer rings of a polygon-clipping result, without the closing point. */
export function outerRings(result: MultiPolygon): Point[][] {
  return result
    .map((polygon) => openRing(polygon[0] ?? []))
    .filter((ring) => ring.length >= 3)
}

function openRing(ring: Ring): Point[] {
  const points: Point[] = ring.map(([x, z]) => [x, z])
  const first = points[0]
  const last = points[points.length - 1]
  if (first && last && points.length > 1) {
    if (first[0] === last[0] && first[1] === last[1]) points.pop()
  }
  return points
}

/** Every ring (outer and holes) of a polygon-clipping result, opened. */
export function allRings(result: MultiPolygon): Point[][][] {
  return result.map((polygon) =>
    polygon.map(openRing).filter((ring) => ring.length >= 3)
  )
}

/**
 * The regions where two outlines overlap. Pass `convexA`/`convexB` when
 * already known to skip the convexity check.
 */
export function intersect(
  a: readonly Point[],
  b: readonly Point[],
  convexA = isConvex(a),
  convexB = isConvex(b)
): Point[][] {
  if (convexA && convexB) {
    const region = clipConvex(a, b)
    return region.length >= 3 ? [region] : []
  }
  return outerRings(polygonClipping.intersection([toRing(a)], [toRing(b)]))
}

/** `subject` minus every outline in `clips`, as outer rings. */
export function difference(
  subject: readonly Point[],
  clips: readonly (readonly Point[])[]
): Point[][] {
  if (clips.length === 0) return [[...subject]]
  return outerRings(
    polygonClipping.difference(
      [toRing(subject)],
      ...clips.map((clip) => [toRing(clip)])
    )
  )
}

/** Union of outlines as polygons with holes (first ring = outer). */
export function union(polygons: readonly (readonly Point[])[]): Point[][][] {
  const [first, ...rest] = polygons
  if (!first) return []
  return allRings(
    polygonClipping.union(
      [toRing(first)],
      ...rest.map((polygon) => [toRing(polygon)])
    )
  )
}

/**
 * Minimum width of a point set (of its convex hull): the thinnest a strip
 * containing it can be. A sliver overlap along an edge has width ≈ 0 even
 * when it is long, which is what overlap tolerances should measure.
 */
export function minWidth(points: readonly Point[]): number {
  const hull = convexHull(points)
  if (hull.length < 3) return 0
  let best = Infinity
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!
    const edge = sub(hull[(i + 1) % hull.length]!, a)
    const length = Math.hypot(edge[0], edge[1])
    if (length < EPS) continue
    let widest = 0
    for (const p of hull) {
      widest = Math.max(widest, Math.abs(cross(edge, sub(p, a))) / length)
    }
    best = Math.min(best, widest)
  }
  return Number.isFinite(best) ? best : 0
}

/** Area of a simple outline. */
export function polygonArea(polygon: readonly Point[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(sum) / 2
}

/** [min, max] of the outline's projection onto `direction`. */
export function project(
  polygon: readonly Point[],
  direction: Point
): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of polygon) {
    const value = dot(p, direction)
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return [min, max]
}

export function translate(polygon: readonly Point[], offset: Point): Point[] {
  return polygon.map((p) => add(p, offset))
}

/** Do two boxes overlap by more than `tolerance` in both x and z? */
export function boundsOverlap(a: Bounds2, b: Bounds2, tolerance = 0): boolean {
  return (
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > tolerance &&
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > tolerance
  )
}

export function unionBounds(boxes: readonly Bounds2[]): Bounds2 {
  return bounds(
    boxes.flatMap((b): Point[] => [
      [b.minX, b.minZ],
      [b.maxX, b.maxZ],
    ])
  )
}

export function boundsCentre(box: Bounds2): Point {
  return [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2]
}

/** Closest pair of points between segments ab and cd. */
export function closestPoints(
  a: Point,
  b: Point,
  c: Point,
  d: Point
): { p: Point; q: Point; distance: number } {
  const candidates: { p: Point; q: Point }[] = [
    { p: a, q: nearestOnSegment(a, c, d) },
    { p: b, q: nearestOnSegment(b, c, d) },
    { p: nearestOnSegment(c, a, b), q: c },
    { p: nearestOnSegment(d, a, b), q: d },
  ]
  const crossing = segmentIntersection(a, b, c, d)
  if (crossing) return { p: crossing, q: crossing, distance: 0 }
  let best = candidates[0]!
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const distance = Math.hypot(
      candidate.p[0] - candidate.q[0],
      candidate.p[1] - candidate.q[1]
    )
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return { ...best, distance: bestDistance }
}

export function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const ab = sub(b, a)
  const lengthSq = dot(ab, ab)
  if (lengthSq === 0) return a
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lengthSq))
  return add(a, scale(ab, t))
}

function segmentIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point
): Point | undefined {
  const r = sub(b, a)
  const s = sub(d, c)
  const denom = cross(r, s)
  if (Math.abs(denom) < EPS) return undefined
  const t = cross(sub(c, a), s) / denom
  const u = cross(sub(c, a), r) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return undefined
  return add(a, scale(r, t))
}

/** Closest points between two outlines (or polylines with `closed` false). */
export function closestBetween(
  a: readonly Point[],
  b: readonly Point[],
  closedA = true,
  closedB = true
): { p: Point; q: Point; distance: number } | undefined {
  let best: { p: Point; q: Point; distance: number } | undefined
  const edgesA = closedA ? a.length : a.length - 1
  const edgesB = closedB ? b.length : b.length - 1
  for (let i = 0; i < edgesA; i++) {
    const p0 = a[i]!
    const p1 = a[(i + 1) % a.length]!
    for (let j = 0; j < edgesB; j++) {
      const q0 = b[j]!
      const q1 = b[(j + 1) % b.length]!
      const candidate = closestPoints(p0, p1, q0, q1)
      if (!best || candidate.distance < best.distance) best = candidate
    }
  }
  return best
}

/**
 * A pie slice: `radius` from `centre`, sweeping from direction `from` to
 * direction `to` (unit vectors, less than 180° apart), clockwise on the plan.
 */
export function sectorPolygon(
  centre: Point,
  from: Point,
  to: Point,
  radius: number,
  segments = 24
): Point[] {
  const start = Math.atan2(from[1], from[0])
  let sweep = Math.atan2(to[1], to[0]) - start
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI
  const points: Point[] = [centre]
  for (let i = 0; i <= segments; i++) {
    const angle = start + (sweep * i) / segments
    points.push([
      centre[0] + radius * Math.cos(angle),
      centre[1] + radius * Math.sin(angle),
    ])
  }
  return ensureClockwiseOnPlan(points)
}
