import type { Point } from "./angles"
import { cross, sub } from "./vec"

// Plain polygon utilities. Room polygons are clockwise on the plan, which
// (with z pointing down the page) means a POSITIVE shoelace area.

export function signedArea(polygon: readonly Point[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum / 2
}

export function area(polygon: readonly Point[]): number {
  return Math.abs(signedArea(polygon))
}

/** True when the polygon runs clockwise as drawn on the plan. */
export function isClockwiseOnPlan(polygon: readonly Point[]): boolean {
  return signedArea(polygon) > 0
}

export function ensureClockwiseOnPlan(polygon: readonly Point[]): Point[] {
  return isClockwiseOnPlan(polygon) ? [...polygon] : [...polygon].reverse()
}

export interface Bounds2 {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

export function bounds(points: readonly Point[]): Bounds2 {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const [x, z] of points) {
    minX = Math.min(minX, x)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxZ = Math.max(maxZ, z)
  }
  return { minX, minZ, maxX, maxZ }
}

/** Even-odd point-in-polygon test (points on the boundary may go either way). */
export function containsPoint(
  polygon: readonly Point[],
  [x, z]: Point
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!
    const [xj, zj] = polygon[j]!
    const crosses =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

/** Do segments ab and cd properly intersect or touch? */
export function segmentsIntersect(
  a: Point,
  b: Point,
  c: Point,
  d: Point
): boolean {
  const d1 = cross(sub(b, a), sub(c, a))
  const d2 = cross(sub(b, a), sub(d, a))
  const d3 = cross(sub(d, c), sub(a, c))
  const d4 = cross(sub(d, c), sub(b, c))
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true
  }
  return (
    (d1 === 0 && onSegment(a, b, c)) ||
    (d2 === 0 && onSegment(a, b, d)) ||
    (d3 === 0 && onSegment(c, d, a)) ||
    (d4 === 0 && onSegment(c, d, b))
  )
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a[0], b[0]) <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] &&
    p[1] <= Math.max(a[1], b[1])
  )
}

/** True when no two non-adjacent edges intersect. O(n²) — fine for rooms. */
export function isSimplePolygon(polygon: readonly Point[]): boolean {
  const n = polygon.length
  if (n < 3) return false
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % n]!
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (adjacent) continue
      const c = polygon[j]!
      const d = polygon[(j + 1) % n]!
      if (segmentsIntersect(a, b, c, d)) return false
    }
  }
  return true
}

/** Axis-aligned rectangle as a clockwise-on-plan polygon. */
export function rectPolygon(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number
): Point[] {
  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ]
}
