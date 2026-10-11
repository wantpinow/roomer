import { convexHull, type Point } from "@roomer/core/geometry"
import { worldShapes } from "@roomer/core/placement"
import type { AssetSpec, Mount, Placement } from "@roomer/core/schema"

/** One placed item's outline on the plan, for drawings and hit areas. */
export interface PlanFootprint {
  id: string
  mount: Mount
  /** Convex outline of all its parts, clockwise on the plan, mm. */
  outline: Point[]
  /** The individual parts' outlines (an L-shaped sofa stays an L). */
  parts: Point[][]
}

/**
 * Footprints of placed items in room space (core `worldShapes`), skipping
 * placements whose asset isn't loaded.
 */
export function planFootprints(
  placements: readonly Placement[],
  assets: Readonly<Record<string, Pick<AssetSpec, "geometry" | "mount">>>
): PlanFootprint[] {
  return placements.flatMap((placement) => {
    const asset = assets[placement.assetId]
    if (!asset) return []
    const parts = worldShapes(placement, asset).map((s) => s.footprint)
    if (parts.length === 0) return []
    return [
      {
        id: placement.id,
        mount: asset.mount,
        outline: convexHull(parts.flat()),
        parts,
      },
    ]
  })
}

/** SVG `points` for an outline. */
export function svgPoints(points: readonly Point[]): string {
  return points.map(([x, z]) => `${x},${z}`).join(" ")
}
