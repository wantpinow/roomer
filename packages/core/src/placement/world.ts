import { assetCollisionShapes } from "../assets/collision"
import type { Point } from "../geometry/angles"
import { bounds, type Bounds2 } from "../geometry/polygon"
import { placementTransform, type PlacementPose } from "../geometry/transform"
import type { AssetSpec } from "../schema"

// A placed item's collision shapes in room space: each part's footprint
// transformed to the plan and its height range lifted by the elevation.

/** Round away float noise (1e-6 mm) so a 90° turn gives 525, not 524.99…. */
const clean = (value: number): number => Math.round(value * 1e6) / 1e6 || 0

export interface WorldShape {
  part: string
  /** Clockwise-on-plan outline in room-space (x, z) mm. */
  footprint: Point[]
  /** Bottom and top above the floor, mm. */
  y0: number
  y1: number
}

export function worldShapes(
  placement: PlacementPose,
  asset: Pick<AssetSpec, "geometry">
): WorldShape[] {
  const transform = placementTransform(placement)
  return assetCollisionShapes(asset).map((shape) => {
    const footprint = shape.footprint.map(([x, z]): Point => {
      const [px, pz] = transform.toPlan(x, z)
      return [clean(px), clean(pz)]
    })
    // Mirroring flips the winding; keep every outline clockwise on the plan.
    if (placement.mirrored) footprint.reverse()
    return {
      part: shape.part,
      footprint,
      y0: shape.y0 + placement.elevation,
      y1: shape.y1 + placement.elevation,
    }
  })
}

/** Plan bounding box of everything the placement covers. */
export function placementFootprintBounds(
  placement: PlacementPose,
  asset: Pick<AssetSpec, "geometry">
): Bounds2 {
  return bounds(worldShapes(placement, asset).flatMap((s) => s.footprint))
}
