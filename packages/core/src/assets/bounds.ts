import {
  applyMatrix3,
  eulerXYZMatrix,
  type Matrix3,
  type Tuple3,
} from "../geometry/rotation3"
import type { AssetSpec, ExtrudePart, Part } from "../schema"

// Axis-aligned bounds of asset parts in item-local mm (origin at the
// footprint centre on the floor, +z = front, y up). Bounds are exact for
// every shape — rotated cylinders, cones and lathes are bounded by their
// cap circles rather than by a rotated box — so they match what three.js
// renders and the dims check isn't thrown off by a tilted leg.

export interface Aabb3 {
  min: Tuple3
  max: Tuple3
}

const NO_ROTATION: Tuple3 = [0, 0, 0]

/** Round away float noise (1e-6 mm) so 499.9999999 reads as 500. */
const clean = (value: number): number => Math.round(value * 1e6) / 1e6 || 0

export function emptyAabb(): Aabb3 {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }
}

export function aabbUnion(a: Aabb3, b: Aabb3): Aabb3 {
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  }
}

export function aabbSize(box: Aabb3): Tuple3 {
  return [
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2],
  ]
}

function aabbOfPoints(points: readonly Tuple3[]): Aabb3 {
  const box = emptyAabb()
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      box.min[i] = Math.min(box.min[i]!, p[i]!)
      box.max[i] = Math.max(box.max[i]!, p[i]!)
    }
  }
  return box
}

/**
 * Bounds of circles of radius r centred at h·axis (axis = the part's
 * rotated local y). Along world axis i a circle spans
 * h·axis_i ± r·√(1 − axis_i²); a frustum or lathe is bounded by its circles.
 */
function aabbOfCircles(
  axis: Tuple3,
  circles: readonly { height: number; radius: number }[]
): Aabb3 {
  const box = emptyAabb()
  for (const { height, radius } of circles) {
    for (let i = 0; i < 3; i++) {
      const centre = height * axis[i]!
      const spread = radius * Math.sqrt(Math.max(0, 1 - axis[i]! ** 2))
      box.min[i] = Math.min(box.min[i]!, centre - spread)
      box.max[i] = Math.max(box.max[i]!, centre + spread)
    }
  }
  return box
}

/** 3D vertices of an extrude part (both end caps), before rotation. */
export function extrudeVertices(part: ExtrudePart): Tuple3[] {
  const half = part.depth / 2
  const vertices: Tuple3[] = []
  for (const e of [-half, half]) {
    for (const [u, v] of part.profile) {
      switch (part.axis) {
        case "y":
          vertices.push([u, e, v])
          break
        case "x":
          vertices.push([e, v, u])
          break
        case "z":
          vertices.push([u, v, e])
          break
      }
    }
  }
  return vertices
}

/** The 8 corners of a box of the given full size, centred on the origin. */
export function boxCorners([w, h, d]: readonly [
  number,
  number,
  number,
]): Tuple3[] {
  const corners: Tuple3[] = []
  for (const x of [-w / 2, w / 2]) {
    for (const y of [-h / 2, h / 2]) {
      for (const z of [-d / 2, d / 2]) corners.push([x, y, z])
    }
  }
  return corners
}

export function partRotationMatrix(part: Part): Matrix3 {
  return eulerXYZMatrix(part.rotation ?? NO_ROTATION)
}

/** Bounds of a part about its own centre (rotation applied, no position). */
function centredPartBounds(part: Part): Aabb3 {
  const m = partRotationMatrix(part)
  const yAxis: Tuple3 = [m[0][1], m[1][1], m[2][1]]
  switch (part.shape) {
    case "box":
    case "roundedBox":
      return aabbOfPoints(boxCorners(part.size).map((p) => applyMatrix3(m, p)))
    case "extrude":
      return aabbOfPoints(extrudeVertices(part).map((p) => applyMatrix3(m, p)))
    case "cylinder":
      return aabbOfCircles(yAxis, [
        { height: -part.height / 2, radius: part.radiusBottom },
        { height: part.height / 2, radius: part.radiusTop },
      ])
    case "lathe":
      return aabbOfCircles(
        yAxis,
        part.profile.map(([radius, height]) => ({ height, radius }))
      )
    case "sphere":
      return {
        min: [-part.radius, -part.radius, -part.radius],
        max: [part.radius, part.radius, part.radius],
      }
  }
}

/** Exact axis-aligned bounds of a part in item-local mm. */
export function partLocalBounds(part: Part): Aabb3 {
  const box = centredPartBounds(part)
  const [px, py, pz] = part.position
  return {
    min: [
      clean(box.min[0] + px),
      clean(box.min[1] + py),
      clean(box.min[2] + pz),
    ],
    max: [
      clean(box.max[0] + px),
      clean(box.max[1] + py),
      clean(box.max[2] + pz),
    ],
  }
}

/** Union of every part's bounds, in item-local mm. */
export function assetLocalBounds(asset: Pick<AssetSpec, "geometry">): Aabb3 {
  return asset.geometry.parts
    .map(partLocalBounds)
    .reduce((acc, box) => aabbUnion(acc, box), emptyAabb())
}
