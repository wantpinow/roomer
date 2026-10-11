import type { Point } from "../geometry/angles"
import { bounds as boundsOf, rectPolygon } from "../geometry/polygon"
import { intersect } from "../lint/polygons"
import {
  LINT_THRESHOLDS,
  type AssetSpec,
  type Clearance,
  type ClearanceZoneSpec,
} from "../schema"
import { assetLocalBounds, type Aabb3 } from "./bounds"
import { assetCollisionShapes } from "./collision"

// The floor an item needs kept free, in item-local mm. By default that is
// `clearance`: a strip along each side of the item's bounding box. When an
// asset lists `clearanceZones`, those exact rectangles replace it — the
// bounding box is the wrong place for an L-shaped sofa, whose legroom is in
// front of the seats, not in front of the chaise tip. Each zone also knows
// which side of the item it serves (the side it touches), which decides
// whether it must be reachable and which way the item backs off from it.

export type ClearanceSide = keyof Clearance

export const CLEARANCE_SIDES: readonly ClearanceSide[] = [
  "front",
  "back",
  "left",
  "right",
]

export interface LocalClearanceZone {
  /** The zone's name, or the side for `clearance` strips. */
  name: string
  side: ClearanceSide
  /** [minX, minZ, maxX, maxZ], item-local mm. */
  rect: [number, number, number, number]
  /** How far the zone reaches away from the item, mm. */
  depth: number
  /** From `clearanceZones` (true) or a `clearance` side (false). */
  custom: boolean
}

/** Local outward direction of each side (left/right as seen facing the item). */
export const SIDE_DIRECTIONS: Record<ClearanceSide, Point> = {
  front: [0, 1],
  back: [0, -1],
  left: [-1, 0],
  right: [1, 0],
}

/** How thick a strip beside a zone's edge counts as touching it, mm. */
const CONTACT_STRIP_MM = 10

/**
 * The side of the item a zone serves: the zone edge that touches the most of
 * the item's footprint (a zone touching the item along its own back edge
 * lies in front of it). A zone touching nothing goes by where its centre is.
 */
export function clearanceZoneSide(
  rect: readonly [number, number, number, number],
  footprints: readonly (readonly Point[])[],
  local: Aabb3
): ClearanceSide {
  const [x0, z0, x1, z1] = rect
  const s = CONTACT_STRIP_MM
  // Strip just outside each edge of the zone, on the item's side.
  const strips: [ClearanceSide, Point[], 0 | 1][] = [
    ["front", rectPolygon(x0, z0 - s, x1, z0), 0],
    ["back", rectPolygon(x0, z1, x1, z1 + s), 0],
    ["right", rectPolygon(x0 - s, z0, x0, z1), 1],
    ["left", rectPolygon(x1, z0, x1 + s, z1), 1],
  ]
  let best: { side: ClearanceSide; contact: number } | undefined
  for (const [side, strip, along] of strips) {
    let contact = 0
    for (const footprint of footprints) {
      for (const region of intersect(footprint, strip)) {
        const b = boundsOf(region)
        contact += along === 0 ? b.maxX - b.minX : b.maxZ - b.minZ
      }
    }
    if (contact > 1 && (!best || contact > best.contact)) {
      best = { side, contact }
    }
  }
  if (best) return best.side
  // Nothing touched: the direction of the zone's centre from the item's,
  // relative to the item's half-size along each axis.
  const cx = (x0 + x1) / 2 - (local.min[0] + local.max[0]) / 2
  const cz = (z0 + z1) / 2 - (local.min[2] + local.max[2]) / 2
  const halfW = Math.max(1, (local.max[0] - local.min[0]) / 2)
  const halfD = Math.max(1, (local.max[2] - local.min[2]) / 2)
  if (Math.abs(cx) / halfW > Math.abs(cz) / halfD) {
    return cx > 0 ? "right" : "left"
  }
  return cz >= 0 ? "front" : "back"
}

const sidesCache = new WeakMap<readonly ClearanceZoneSpec[], ClearanceSide[]>()

/** The side each of an asset's custom zones serves (cached per zone list). */
function customZoneSides(
  asset: Pick<AssetSpec, "geometry">,
  zones: readonly ClearanceZoneSpec[],
  local: Aabb3
): ClearanceSide[] {
  const cached = sidesCache.get(zones)
  if (cached) return cached
  const footprints = assetCollisionShapes(asset)
    .filter(
      (shape) =>
        shape.footprint.length >= 3 &&
        shape.y0 < LINT_THRESHOLDS.walkingHeightMm
    )
    .map((shape) => shape.footprint)
  const sides = zones.map((zone) =>
    clearanceZoneSide(zone.rect, footprints, local)
  )
  sidesCache.set(zones, sides)
  return sides
}

/**
 * Every zone the item needs free, item-local: its `clearanceZones` when it
 * has any, else one strip per `clearance` side of its bounding box.
 */
export function assetClearanceZones(
  asset: Pick<AssetSpec, "geometry" | "clearance" | "clearanceZones">,
  local: Aabb3 = assetLocalBounds(asset)
): LocalClearanceZone[] {
  const custom = asset.clearanceZones
  if (custom && custom.length > 0) {
    const sides = customZoneSides(asset, custom, local)
    return custom.map((zone, i) => {
      const side = sides[i]!
      const [x0, z0, x1, z1] = zone.rect
      return {
        name: zone.name,
        side,
        rect: [x0, z0, x1, z1],
        depth: side === "front" || side === "back" ? z1 - z0 : x1 - x0,
        custom: true,
      }
    })
  }
  const clearance = asset.clearance
  if (!clearance) return []
  const { min, max } = local
  return CLEARANCE_SIDES.flatMap((side): LocalClearanceZone[] => {
    const depth = clearance[side] ?? 0
    if (depth <= 0) return []
    const rect: Record<ClearanceSide, [number, number, number, number]> = {
      front: [min[0], max[2], max[0], max[2] + depth],
      back: [min[0], min[2] - depth, max[0], min[2]],
      left: [min[0] - depth, min[2], min[0], max[2]],
      right: [max[0], min[2], max[0] + depth, max[2]],
    }
    return [{ name: side, side, rect: rect[side], depth, custom: false }]
  })
}
