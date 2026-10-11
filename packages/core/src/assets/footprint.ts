import polygonClipping, { type Ring } from "polygon-clipping"

import type { Point } from "../geometry/angles"
import { pointSegmentDistance } from "../geometry/distance"
import { area, ensureClockwiseOnPlan } from "../geometry/polygon"
import { distance } from "../geometry/vec"
import type { AssetSpec } from "../schema"
import { assetCollisionShapes } from "./collision"

// A light plan sketch of an asset: the union of its parts' footprints seen
// from above, in item-local (x, z) mm, simplified to a handful of points —
// enough for a library card to draw an L-shaped sofa or a round table when
// there's no photo. Holes are dropped; separate pieces stay separate.

/** Points closer than this to the simplified outline are dropped. */
export const FOOTPRINT_TOLERANCE_MM = 10

/** Douglas–Peucker on an open polyline (keeps both ends). */
function simplifyPolyline(
  points: readonly Point[],
  tolerance: number
): Point[] {
  if (points.length <= 2) return [...points]
  const first = points[0]!
  const last = points[points.length - 1]!
  let farthest = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointSegmentDistance(points[i]!, first, last)
    if (d > farthest) {
      farthest = d
      index = i
    }
  }
  if (farthest <= tolerance) return [first, last]
  const left = simplifyPolyline(points.slice(0, index + 1), tolerance)
  const right = simplifyPolyline(points.slice(index), tolerance)
  return [...left.slice(0, -1), ...right]
}

/** Douglas–Peucker on a closed ring, split at its two farthest-apart points. */
function simplifyRing(ring: readonly Point[], tolerance: number): Point[] {
  if (ring.length <= 4) return [...ring]
  const start = ring[0]!
  let split = 0
  ring.forEach((point, i) => {
    if (distance(point, start) > distance(ring[split]!, start)) split = i
  })
  const there = simplifyPolyline(ring.slice(0, split + 1), tolerance)
  const back = simplifyPolyline([...ring.slice(split), start], tolerance)
  return [...there.slice(0, -1), ...back.slice(0, -1)]
}

function openRing(ring: Ring): Point[] {
  const points: Point[] = ring.map(([x, z]) => [x, z])
  const first = points[0]
  const last = points[points.length - 1]
  if (first && last && points.length > 1 && first[0] === last[0]) {
    if (first[1] === last[1]) points.pop()
  }
  return points
}

/** Round to whole mm and drop repeated points. */
function roundRing(ring: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const [x, z] of ring) {
    const point: Point = [Math.round(x) || 0, Math.round(z) || 0]
    const previous = out[out.length - 1]
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) {
      out.push(point)
    }
  }
  const first = out[0]
  const last = out[out.length - 1]
  if (out.length > 1 && first && last) {
    if (first[0] === last[0] && first[1] === last[1]) out.pop()
  }
  return out
}

/**
 * The asset's outline from above: one clockwise ring per separate piece,
 * largest first, item-local (x, z) whole mm.
 */
export function assetFootprint(
  asset: Pick<AssetSpec, "geometry">,
  tolerance = FOOTPRINT_TOLERANCE_MM
): Point[][] {
  const rings: Ring[] = assetCollisionShapes(asset)
    .map((shape) => shape.footprint)
    .filter((footprint) => footprint.length >= 3 && area(footprint) > 0)
    .map((footprint) => footprint.map(([x, z]): [number, number] => [x, z]))
  const [first, ...rest] = rings
  if (!first) return []
  return polygonClipping
    .union([first], ...rest.map((ring) => [ring]))
    .map((polygon) => openRing(polygon[0] ?? []))
    .map((ring) => roundRing(simplifyRing(ring, tolerance)))
    .filter((ring) => ring.length >= 3 && area(ring) > 0)
    .map((ring) => ensureClockwiseOnPlan(ring))
    .sort((a, b) => area(b) - area(a))
}
