import {
  add,
  containsPoint,
  dot,
  type Point,
  scale,
  signedArea,
  sub,
} from "@roomer/core/geometry"

// Circle-versus-polygon contact on the plan: how far, and in which
// direction, to push a circle so it no longer overlaps a solid outline, or
// so it stays inside an enclosing one (the room). Works for non-convex
// outlines because it always measures to the closest point on the boundary.

export interface Penetration {
  /** Unit direction to push the circle. */
  normal: Point
  /** How far to push it, mm. */
  depth: number
  /** Index of the edge the closest point lies on (edge i runs i → i+1). */
  edge: number
}

export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const ab = sub(b, a)
  const lengthSq = dot(ab, ab)
  if (lengthSq === 0) return a
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lengthSq))
  return add(a, scale(ab, t))
}

interface Closest {
  point: Point
  distance: number
  edge: number
}

export function closestBoundaryPoint(
  p: Point,
  polygon: readonly Point[]
): Closest {
  let best: Closest = { point: polygon[0]!, distance: Infinity, edge: 0 }
  for (let i = 0; i < polygon.length; i++) {
    const q = closestPointOnSegment(
      p,
      polygon[i]!,
      polygon[(i + 1) % polygon.length]!
    )
    const d = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (d < best.distance) best = { point: q, distance: d, edge: i }
  }
  return best
}

/** Unit normal of edge i pointing out of the polygon (either winding). */
export function outwardEdgeNormal(
  polygon: readonly Point[],
  edge: number
): Point {
  const a = polygon[edge]!
  const b = polygon[(edge + 1) % polygon.length]!
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const e: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
  // Clockwise on the plan (positive area): the inward normal is (−e.z, e.x).
  return signedArea(polygon) > 0 ? [e[1], -e[0]] : [-e[1], e[0]]
}

const EPS = 1e-9

/** Push a circle out of a solid polygon; null when they don't overlap. */
export function circlePolygonPenetration(
  center: Point,
  radius: number,
  polygon: readonly Point[]
): Penetration | null {
  const closest = closestBoundaryPoint(center, polygon)
  const inside = containsPoint(polygon, center)
  if (!inside && closest.distance >= radius) return null
  let normal: Point
  if (closest.distance < EPS) {
    normal = outwardEdgeNormal(polygon, closest.edge)
  } else {
    const away = sub(center, closest.point)
    normal = scale(away, (inside ? -1 : 1) / closest.distance)
  }
  return {
    normal,
    depth: inside ? closest.distance + radius : radius - closest.distance,
    edge: closest.edge,
  }
}

/** Keep a circle inside an enclosing polygon; null when it fits. */
export function circleInsidePenetration(
  center: Point,
  radius: number,
  polygon: readonly Point[]
): Penetration | null {
  const closest = closestBoundaryPoint(center, polygon)
  const inside = containsPoint(polygon, center)
  if (inside && closest.distance >= radius) return null
  let normal: Point
  if (closest.distance < EPS) {
    normal = scale(outwardEdgeNormal(polygon, closest.edge), -1)
  } else {
    const towards = sub(center, closest.point)
    normal = scale(towards, (inside ? 1 : -1) / closest.distance)
  }
  return {
    normal,
    depth: inside ? radius - closest.distance : closest.distance + radius,
    edge: closest.edge,
  }
}

/** Does a circle overlap a solid polygon (touching counts as not)? */
export function circleOverlapsPolygon(
  center: Point,
  radius: number,
  polygon: readonly Point[]
): boolean {
  return circlePolygonPenetration(center, radius, polygon) !== null
}
