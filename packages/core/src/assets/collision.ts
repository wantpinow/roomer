import type { Point } from "../geometry/angles"
import {
  circumscribedPolygon,
  clipToBounds,
  convexHull,
} from "../geometry/hull"
import { ensureClockwiseOnPlan } from "../geometry/polygon"
import { applyMatrix3, type Tuple3 } from "../geometry/rotation3"
import type { AssetSpec, Part } from "../schema"
import {
  boxCorners,
  extrudeVertices,
  partLocalBounds,
  partRotationMatrix,
} from "./bounds"

// Collision shapes: each part becomes a plan footprint (item-local x, z)
// plus a height range, which is what lint and placement work with (spec §5
// "Collision shape"). Upright extrudes keep their real outline so an
// L-shaped sofa gets an L-shaped footprint; upright round parts become a
// 16-gon; anything else is the convex hull of its rotated box, clipped to the
// part's exact bounds so footprints never poke past `partLocalBounds`.

export interface LocalShape {
  part: string
  /** Clockwise-on-plan outline in item-local (x, z) mm. */
  footprint: Point[]
  /** Bottom and top of the part in item-local mm (y). */
  y0: number
  y1: number
}

const ROUND_SIDES = 16

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

export function partCollisionShape(part: Part): LocalShape {
  const bounds = partLocalBounds(part)
  const m = partRotationMatrix(part)
  // Local y still vertical (only turned about y, or flipped upside down).
  const upright = Math.abs(Math.abs(m[1][1]) - 1) < 1e-9
  const [px, , pz] = part.position
  const project = (p: Tuple3): Point => {
    const [x, , z] = applyMatrix3(m, p)
    return [x + px, z + pz]
  }
  const hullWithinBounds = (points: Tuple3[]): Point[] =>
    clipToBounds(convexHull(points.map(project)), {
      minX: bounds.min[0],
      maxX: bounds.max[0],
      minZ: bounds.min[2],
      maxZ: bounds.max[2],
    })

  let footprint: Point[]
  switch (part.shape) {
    case "box":
    case "roundedBox":
      footprint = convexHull(boxCorners(part.size).map(project))
      break
    case "extrude":
      footprint =
        part.axis === "y" && upright
          ? ensureClockwiseOnPlan(
              part.profile.map(([u, v]) => project([u, 0, v]))
            )
          : convexHull(extrudeVertices(part).map(project))
      break
    case "sphere":
      footprint = circumscribedPolygon([px, pz], part.radius, ROUND_SIDES)
      break
    case "cylinder": {
      const r = Math.max(part.radiusTop, part.radiusBottom)
      footprint = upright
        ? circumscribedPolygon([px, pz], r, ROUND_SIDES)
        : hullWithinBounds(
            cornersOf([-r, -part.height / 2, -r], [r, part.height / 2, r])
          )
      break
    }
    case "lathe": {
      const r = Math.max(...part.profile.map(([radius]) => radius))
      const ys = part.profile.map(([, y]) => y)
      footprint = upright
        ? circumscribedPolygon([px, pz], r, ROUND_SIDES)
        : hullWithinBounds(
            cornersOf([-r, Math.min(...ys), -r], [r, Math.max(...ys), r])
          )
      break
    }
  }

  return {
    part: part.name,
    footprint: footprint.map(([x, z]) => [clean(x), clean(z)]),
    y0: bounds.min[1],
    y1: bounds.max[1],
  }
}

/** One collision shape per part, in item-local mm. */
export function assetCollisionShapes(
  asset: Pick<AssetSpec, "geometry">
): LocalShape[] {
  return asset.geometry.parts.map(partCollisionShape)
}
