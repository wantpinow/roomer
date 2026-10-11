import {
  applyMatrix3,
  eulerXYZMatrix,
  type Matrix3,
  type Tuple3,
} from "../geometry/rotation3"
import type {
  AssetSpec,
  ExtrudePart,
  LathePart,
  Part,
  RoundedBoxPart,
  TorusPart,
} from "../schema"
import { expandParts } from "./expand"
import {
  extrudeRings,
  latheArc,
  sinusoidRange,
  torusArc,
  type Arc,
} from "./shapes"

// Axis-aligned bounds of asset parts in item-local mm (origin at the
// footprint centre on the floor, +z = front, y up). Bounds are exact for
// every shape — rotated cylinders, cones and lathes are bounded by their
// cap circles rather than by a rotated box, partial revolves by their arcs,
// capsules and tori by their round ends and tubes — so they match what
// three.js renders and the dims check isn't thrown off by a tilted leg.
// (A rounded box with every edge rounded is the one exception: it is bounded
// by its box, which over-estimates it slightly when it is turned.)

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

/** Grows a box by a (non-negative) amount per axis. */
function grow(box: Aabb3, by: (axis: number) => number): Aabb3 {
  const out = emptyAabb()
  for (let i = 0; i < 3; i++) {
    out.min[i] = box.min[i]! - by(i)
    out.max[i] = box.max[i]! + by(i)
  }
  return out
}

/**
 * Maps an extrude's profile coordinates [u, v] and its axial position e to
 * item-local (x, y, z): axis y → (u, e, v), x → (e, v, u), z → (u, v, e).
 */
export function extrudePoint(
  axis: ExtrudePart["axis"],
  u: number,
  v: number,
  e: number
): Tuple3 {
  switch (axis) {
    case "y":
      return [u, e, v]
    case "x":
      return [e, v, u]
    case "z":
      return [u, v, e]
  }
}

/** 3D vertices of an extrude part (every ring, bevel included), unrotated. */
export function extrudeVertices(part: ExtrudePart): Tuple3[] {
  return extrudeRings(part).flatMap((ring) =>
    ring.points.map(([u, v]) => extrudePoint(part.axis, u, v, ring.e))
  )
}

/**
 * A rounded box whose upright edges only are rounded: the box shrunk by the
 * radius in x and z, swept by a horizontal disc of that radius. Along world
 * axis i a disc whose normal is `up` reaches r·√(1 − up_i²).
 */
function verticalRoundedBoxBounds(
  part: RoundedBoxPart,
  m: Matrix3,
  up: Tuple3
): Aabb3 {
  const [w, h, d] = part.size
  const r = Math.max(0, Math.min(part.radius, w / 2, d / 2))
  const inner = aabbOfPoints(
    boxCorners([w - 2 * r, h, d - 2 * r]).map((p) => applyMatrix3(m, p))
  )
  return grow(inner, (i) => r * Math.sqrt(Math.max(0, 1 - up[i]! ** 2)))
}

/**
 * A partial revolve of a [radius, y] profile. A profile point traces an arc;
 * along world axis i its reach is y·up_i + r·(m_i0·sin φ + m_i2·cos φ),
 * extreme at the arc's ends or where the sinusoid peaks on the arc.
 */
function arcRevolveBounds(
  profile: readonly (readonly [number, number])[],
  m: Matrix3,
  arc: Arc
): Aabb3 {
  const box = emptyAabb()
  for (let i = 0; i < 3; i++) {
    const row = m[i]!
    const reach = sinusoidRange(row[0], row[2], arc)
    for (const [radius, y] of profile) {
      box.min[i] = Math.min(box.min[i]!, y * row[1] + radius * reach.min)
      box.max[i] = Math.max(box.max[i]!, y * row[1] + radius * reach.max)
    }
  }
  return box
}

function latheBounds(part: LathePart, m: Matrix3, up: Tuple3): Aabb3 {
  const arc = latheArc(part)
  return arc
    ? arcRevolveBounds(part.profile, m, arc)
    : aabbOfCircles(
        up,
        part.profile.map(([radius, height]) => ({ height, radius }))
      )
}

/**
 * A torus is the ring's centre circle swept by the tube's circle. At ring
 * angle φ, along world axis i, the centre reaches R·g(φ) and the tube adds
 * ±t·√(g² + up_i²), with g = m_i0·sin φ + m_i2·cos φ. Both ends move with g
 * (because tube ≤ radius), so the extremes sit where g is extreme on the arc.
 */
function torusBounds(part: TorusPart, m: Matrix3, up: Tuple3): Aabb3 {
  const box = emptyAabb()
  const arc = torusArc(part)
  for (let i = 0; i < 3; i++) {
    const row = m[i]!
    const { min, max } = sinusoidRange(row[0], row[2], arc)
    const tube = (g: number) => part.tube * Math.sqrt(g * g + up[i]! ** 2)
    box.min[i] = part.radius * min - tube(min)
    box.max[i] = part.radius * max + tube(max)
  }
  return box
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

/** The part's local y axis after rotation (its "up"). */
export function partUpAxis(m: Matrix3): Tuple3 {
  return [m[0][1], m[1][1], m[2][1]]
}

/** Bounds of a part about its own centre (rotation applied, no position). */
function centredPartBounds(part: Part): Aabb3 {
  const m = partRotationMatrix(part)
  const yAxis = partUpAxis(m)
  switch (part.shape) {
    case "box":
      return aabbOfPoints(boxCorners(part.size).map((p) => applyMatrix3(m, p)))
    case "roundedBox":
      return part.edges === "vertical"
        ? verticalRoundedBoxBounds(part, m, yAxis)
        : aabbOfPoints(boxCorners(part.size).map((p) => applyMatrix3(m, p)))
    case "extrude":
      return aabbOfPoints(extrudeVertices(part).map((p) => applyMatrix3(m, p)))
    case "cylinder":
      return aabbOfCircles(yAxis, [
        { height: -part.height / 2, radius: part.radiusBottom },
        { height: part.height / 2, radius: part.radiusTop },
      ])
    case "lathe":
      return latheBounds(part, m, yAxis)
    case "sphere":
      return {
        min: [-part.radius, -part.radius, -part.radius],
        max: [part.radius, part.radius, part.radius],
      }
    case "capsule": {
      const half = part.length / 2
      const ends: Tuple3[] = [
        [yAxis[0] * half, yAxis[1] * half, yAxis[2] * half],
        [-yAxis[0] * half, -yAxis[1] * half, -yAxis[2] * half],
      ]
      return grow(aabbOfPoints(ends), () => part.radius)
    }
    case "torus":
      return torusBounds(part, m, yAxis)
  }
}

/**
 * Exact axis-aligned bounds of one part in item-local mm. A repeated part
 * is measured as its first copy; expand parts first (`expandParts`) to see
 * every copy — `assetLocalBounds` does.
 */
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

/** Union of every part's bounds (repeats expanded), in item-local mm. */
export function assetLocalBounds(asset: Pick<AssetSpec, "geometry">): Aabb3 {
  return expandParts(asset.geometry.parts)
    .map(partLocalBounds)
    .reduce((acc, box) => aabbUnion(acc, box), emptyAabb())
}
