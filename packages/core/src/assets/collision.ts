import type { Point } from "../geometry/angles"
import {
  circumscribedPolygon,
  clipToBounds,
  convexHull,
} from "../geometry/hull"
import { ensureClockwiseOnPlan } from "../geometry/polygon"
import { applyMatrix3, type Matrix3, type Tuple3 } from "../geometry/rotation3"
import type { AssetSpec, Part } from "../schema"
import {
  boxCorners,
  extrudeVertices,
  partLocalBounds,
  partRotationMatrix,
  type Aabb3,
} from "./bounds"
import { expandParts } from "./expand"
import { arcAngles, latheArc, revolvePoint, torusArc, type Arc } from "./shapes"

// Collision shapes: each part becomes a plan footprint (item-local x, z)
// plus a height range, which is what lint and placement work with (spec §5
// "Collision shape"). Upright extrudes keep their real outline so an
// L-shaped sofa gets an L-shaped footprint; upright round parts become a
// 16-gon, and upright partial revolves (a barrel chair's C-shaped wall, a
// half-round rim) an annular sector; capsules are the hull of their two
// round ends; anything else is the convex hull of its rotated shape, clipped
// to the part's exact bounds so footprints never poke past `partLocalBounds`.

export interface LocalShape {
  part: string
  /** Clockwise-on-plan outline in item-local (x, z) mm. */
  footprint: Point[]
  /** Bottom and top of the part in item-local mm (y). */
  y0: number
  y1: number
}

const ROUND_SIDES = 16
/** Widest step between the points tracing an arc (16 per full turn). */
const ARC_STEP = 360 / ROUND_SIDES

const clean = (value: number): number => Math.round(value * 1e6) / 1e6 || 0

function cornersOf(min: Tuple3, max: Tuple3): Tuple3[] {
  const corners: Tuple3[] = []
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) corners.push([x, y, z])
    }
  }
  return corners
}

function planBox(bounds: Aabb3) {
  return {
    minX: bounds.min[0],
    maxX: bounds.max[0],
    minZ: bounds.min[2],
    maxZ: bounds.max[2],
  }
}

/**
 * The plan outline of an arc band between two radii (centred on the
 * origin): the outer edge follows tangents to the circle, so it contains
 * the arc; the inner edge is chords, which dip inside it. An inner radius
 * of 0 makes a sector.
 */
export function annularSector(arc: Arc, inner: number, outer: number): Point[] {
  const angles = arcAngles(arc, ARC_STEP)
  const steps = angles.length - 1
  const half = arc.length / steps / 2
  const tangent = outer / Math.cos((half * Math.PI) / 180)
  const toPlan = (phi: number, radius: number): Point => {
    const [x, , z] = revolvePoint(phi, radius, 0)
    return [x, z]
  }
  const outside: Point[] = [
    toPlan(arc.start, outer),
    ...angles.slice(1).map((phi) => toPlan(phi - half, tangent)),
    toPlan(arc.start + arc.length, outer),
  ]
  const inside: Point[] =
    inner > 0
      ? [...angles].reverse().map((phi) => toPlan(phi, inner))
      : [[0, 0]]
  return [...outside, ...inside]
}

/**
 * Sample points of a revolve (profile [radius, y] swept over the arc),
 * pushed out so their hull contains the true surface: between samples a
 * circle bulges past its chord by at most r·(1/cos(step/2) − 1).
 */
function revolveSamples(
  profile: readonly (readonly [number, number])[],
  arc: Arc | undefined
): Tuple3[] {
  const angles = arcAngles(arc ?? { start: 0, length: 360 }, ARC_STEP)
  const half = (arc?.length ?? 360) / (angles.length - 1) / 2
  const swell = 1 / Math.cos((half * Math.PI) / 180)
  return profile.flatMap(([radius, y]) =>
    angles.map((phi) => revolvePoint(phi, radius * swell, y))
  )
}

/** A plan footprint for a revolve: disc, annular sector, or hull. */
function revolveFootprint(options: {
  m: Matrix3
  upright: boolean
  position: Tuple3
  bounds: Aabb3
  arc: Arc | undefined
  inner: number
  outer: number
  profile: readonly (readonly [number, number])[]
}): Point[] {
  const { m, position, bounds } = options
  const [px, , pz] = position
  if (options.upright && !options.arc) {
    return circumscribedPolygon([px, pz], options.outer, ROUND_SIDES)
  }
  const project = (p: Tuple3): Point => {
    const [x, , z] = applyMatrix3(m, p)
    return [x + px, z + pz]
  }
  if (options.upright && options.arc) {
    const sector = annularSector(options.arc, options.inner, options.outer)
    const turned = sector.map(([x, z]) => project([x, 0, z]))
    return clipToBounds(ensureClockwiseOnPlan(turned), planBox(bounds))
  }
  return clipToBounds(
    convexHull(revolveSamples(options.profile, options.arc).map(project)),
    planBox(bounds)
  )
}

/** A ring of `sides` points around (radius, 0) in the profile plane. */
function tubeProfile(
  radius: number,
  tube: number,
  sides = 8
): [number, number][] {
  const reach = tube / Math.cos(Math.PI / sides)
  return Array.from({ length: sides }, (_, i) => {
    const angle = (2 * Math.PI * (i + 0.5)) / sides
    return [
      Math.max(0, radius + reach * Math.cos(angle)),
      reach * Math.sin(angle),
    ]
  })
}

function partFootprint(part: Part, bounds: Aabb3): Point[] {
  const m = partRotationMatrix(part)
  // Local y still vertical (only turned about y, or flipped upside down).
  const upright = Math.abs(Math.abs(m[1][1]) - 1) < 1e-9
  const [px, , pz] = part.position
  const project = (p: Tuple3): Point => {
    const [x, , z] = applyMatrix3(m, p)
    return [x + px, z + pz]
  }
  const hullWithinBounds = (points: Tuple3[]): Point[] =>
    clipToBounds(convexHull(points.map(project)), planBox(bounds))

  switch (part.shape) {
    case "box":
    case "roundedBox":
      return convexHull(boxCorners(part.size).map(project))
    case "extrude":
      return part.axis === "y" && upright
        ? ensureClockwiseOnPlan(
            part.profile.map(([u, v]) => project([u, 0, v]))
          )
        : convexHull(extrudeVertices(part).map(project))
    case "sphere":
      return circumscribedPolygon([px, pz], part.radius, ROUND_SIDES)
    case "capsule": {
      // Seen from above a capsule is the hull of its two round ends.
      const half = part.length / 2
      const ends = [project([0, -half, 0]), project([0, half, 0])]
      return clipToBounds(
        convexHull(
          ends.flatMap((end) =>
            circumscribedPolygon(end, part.radius, ROUND_SIDES)
          )
        ),
        planBox(bounds)
      )
    }
    case "cylinder": {
      const r = Math.max(part.radiusTop, part.radiusBottom)
      return upright
        ? circumscribedPolygon([px, pz], r, ROUND_SIDES)
        : hullWithinBounds(
            cornersOf([-r, -part.height / 2, -r], [r, part.height / 2, r])
          )
    }
    case "lathe": {
      const radii = part.profile.map(([radius]) => radius)
      const arc = latheArc(part)
      if (!arc && !upright) {
        const r = Math.max(...radii)
        const ys = part.profile.map(([, y]) => y)
        return hullWithinBounds(
          cornersOf([-r, Math.min(...ys), -r], [r, Math.max(...ys), r])
        )
      }
      return revolveFootprint({
        m,
        upright,
        position: part.position,
        bounds,
        arc,
        inner: Math.min(...radii),
        outer: Math.max(...radii),
        profile: part.profile,
      })
    }
    case "torus":
      return revolveFootprint({
        m,
        upright,
        position: part.position,
        bounds,
        arc: torusArc(part),
        inner: Math.max(0, part.radius - part.tube),
        outer: part.radius + part.tube,
        profile: tubeProfile(part.radius, part.tube),
      })
  }
}

/** The collision shape of one part (a single copy; see `expandParts`). */
export function partCollisionShape(part: Part): LocalShape {
  const bounds = partLocalBounds(part)
  return {
    part: part.name,
    footprint: partFootprint(part, bounds).map(([x, z]) => [
      clean(x),
      clean(z),
    ]),
    y0: bounds.min[1],
    y1: bounds.max[1],
  }
}

/** One collision shape per part (repeats expanded), in item-local mm. */
export function assetCollisionShapes(
  asset: Pick<AssetSpec, "geometry">
): LocalShape[] {
  return expandParts(asset.geometry.parts).map(partCollisionShape)
}
