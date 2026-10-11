import { assetLocalBounds, type Aabb3 } from "../assets/bounds"
import { normalizeBearing, type Point } from "../geometry/angles"
import { formatDegrees, formatMm } from "../geometry/format"
import { placementTransform } from "../geometry/transform"
import { dot } from "../geometry/vec"
import { cornerAngles, wallPoint, type Wall } from "../geometry/walls"
import {
  DEFAULT_FACING,
  isCeilingFeature,
  isWallFeature,
  type AgainstPosition,
  type AlongAnchor,
  type AssetSpec,
  type CenterOnPosition,
  type InCornerPosition,
  type OnWallPosition,
  type PlacementPosition,
  type WallSide,
} from "../schema"
import type { PlacementContext, Pose } from "./context"
import { idRange, listIds, PlacementError } from "./errors"

// Resolves the relative placement helpers (architecture §3.3) to a stored
// pose: integer-mm centre, facing to 0.01°, elevation. Wall-relative modes
// use the asset's actual bounds so the touching face is exactly flush.

export interface ResolveOptions {
  /** Whether the item is mirrored (left/right swap); affects flushness. */
  mirrored?: boolean
  /** Id of the placement being moved, so it can't be centred on itself. */
  self?: string
}

export function resolvePosition(
  position: PlacementPosition,
  asset: AssetSpec,
  ctx: PlacementContext,
  options: ResolveOptions = {}
): Pose {
  const bounds = mirroredBounds(
    assetLocalBounds(asset),
    options.mirrored ?? false
  )
  switch (position.mode) {
    case "at":
      return pose(
        [position.x, position.z],
        position.facing ?? DEFAULT_FACING,
        elevationFor(asset, bounds, ctx, "at", position.elevation)
      )
    case "against":
      return resolveAgainst(position, asset, bounds, ctx)
    case "onWall":
      return resolveOnWall(position, bounds, ctx)
    case "centerOn":
      return resolveCenterOn(position, asset, bounds, ctx, options.self)
    case "inCorner":
      return resolveInCorner(position, asset, bounds, ctx)
  }
}

/** Bounds of the mirrored geometry (x flipped) in the unmirrored frame. */
function mirroredBounds(bounds: Aabb3, mirrored: boolean): Aabb3 {
  if (!mirrored) return bounds
  return {
    min: [-bounds.max[0], bounds.min[1], bounds.min[2]],
    max: [-bounds.min[0], bounds.max[1], bounds.max[2]],
  }
}

/** Normalise a facing to [0, 360) and round it to 0.01°. */
export function roundFacing(facing: number): number {
  return normalizeBearing(Math.round(facing * 100) / 100)
}

function pose(centre: Point, facing: number, elevation: number): Pose {
  return {
    x: Math.round(centre[0]) || 0,
    z: Math.round(centre[1]) || 0,
    facing: roundFacing(facing),
    elevation: Math.round(elevation) || 0,
  }
}

function elevationFor(
  asset: AssetSpec,
  bounds: Aabb3,
  ctx: PlacementContext,
  mode: PlacementPosition["mode"],
  given: number | undefined
): number {
  if (given !== undefined) return given
  switch (asset.mount) {
    case "floor":
    case "floor-covering":
      return 0
    case "ceiling":
      return ceilingElevation(asset, bounds, ctx.room.ceilingHeight)
    case "wall":
      throw new PlacementError(
        "NEEDS_ON_WALL",
        `${asset.name} is wall-mounted: place it with mode "onWall" (wall, at, elevation) rather than "${mode}", or give an explicit elevation.`
      )
  }
}

/** Elevation that puts a ceiling item's top against the ceiling. */
export function ceilingElevation(
  asset: Pick<AssetSpec, "name">,
  bounds: Aabb3,
  ceilingHeight: number
): number {
  const elevation = ceilingHeight - bounds.max[1]
  if (elevation < 0) {
    throw new PlacementError(
      "TOO_TALL",
      `${asset.name} is ${formatMm(bounds.max[1])} tall, more than the ${formatMm(ceilingHeight)} ceiling, so it can't hang from it.`
    )
  }
  return Math.round(elevation)
}

function findWallOrThrow(ctx: PlacementContext, id: string): Wall {
  const wall = ctx.walls.find((w) => w.id === id)
  if (!wall) {
    throw new PlacementError(
      "UNKNOWN_WALL",
      `Wall ${id} doesn't exist — this room has walls ${idRange("W", ctx.walls.length)}.`
    )
  }
  return wall
}

function checkAt(wall: Wall, at: number): void {
  if (at < 0 || at > wall.length + 0.5) {
    throw new PlacementError(
      "AT_OUT_OF_RANGE",
      `at ${formatMm(at)} is off the end of ${wall.id}, which is ${formatMm(wall.length)} long. Measure from ${wall.startCorner}: use a value between 0 and ${formatMm(wall.length)}.`
    )
  }
}

/** Facing that puts the given side of an item against a wall. */
function facingFor(wall: Wall, side: WallSide): number {
  switch (side) {
    case "back":
      return wall.inwardBearing
    case "left": // left (local −x) towards the wall → front points to the start corner
      return wall.inwardBearing + 90
    case "right":
      return wall.inwardBearing - 90
  }
}

interface WallExtent {
  /** Item's extent along the wall, relative to its centre. */
  alongMin: number
  alongMax: number
  /** Item's extent into the room, relative to its centre. */
  insetMin: number
  insetMax: number
}

/** The item's footprint rectangle measured in a wall's frame. */
function extentInWallFrame(
  wall: Wall,
  bounds: Aabb3,
  facing: number
): WallExtent {
  const t = placementTransform({ x: 0, z: 0, facing, elevation: 0 })
  const corners = [
    t.toPlan(bounds.min[0], bounds.min[2]),
    t.toPlan(bounds.max[0], bounds.min[2]),
    t.toPlan(bounds.max[0], bounds.max[2]),
    t.toPlan(bounds.min[0], bounds.max[2]),
  ]
  const along = corners.map((c) => dot(c, wall.dir))
  const inset = corners.map((c) => dot(c, wall.normal))
  return {
    alongMin: Math.min(...along),
    alongMax: Math.max(...along),
    insetMin: Math.min(...inset),
    insetMax: Math.max(...inset),
  }
}

/**
 * Centre that puts the item's wall-side face `inset` mm off the plaster and
 * its anchor point `at` mm along the wall.
 */
function centreAgainstWall(
  wall: Wall,
  extent: WallExtent,
  at: number,
  anchor: AlongAnchor,
  inset: number
): Point {
  const along =
    anchor === "center"
      ? at - (extent.alongMin + extent.alongMax) / 2
      : anchor === "start-edge"
        ? at - extent.alongMin
        : at - extent.alongMax
  return wallPoint(wall, along, inset - extent.insetMin)
}

function resolveAgainst(
  position: AgainstPosition,
  asset: AssetSpec,
  bounds: Aabb3,
  ctx: PlacementContext
): Pose {
  const wall = findWallOrThrow(ctx, position.wall)
  checkAt(wall, position.at)
  const facing = roundFacing(facingFor(wall, position.side ?? "back"))
  const extent = extentInWallFrame(wall, bounds, facing)
  const inset = ctx.room.skirting.depth + (position.gap ?? 0)
  return pose(
    centreAgainstWall(
      wall,
      extent,
      position.at,
      position.anchor ?? "center",
      inset
    ),
    facing,
    elevationFor(asset, bounds, ctx, "against", position.elevation)
  )
}

function resolveOnWall(
  position: OnWallPosition,
  bounds: Aabb3,
  ctx: PlacementContext
): Pose {
  const wall = findWallOrThrow(ctx, position.wall)
  checkAt(wall, position.at)
  const facing = roundFacing(wall.inwardBearing)
  const extent = extentInWallFrame(wall, bounds, facing)
  // Above the skirting the back can sit on the plaster; below it, it can't.
  const bottom = position.elevation + bounds.min[1]
  const skirting =
    bottom >= ctx.room.skirting.height ? 0 : ctx.room.skirting.depth
  const inset = skirting + (position.gap ?? 0)
  return pose(
    centreAgainstWall(
      wall,
      extent,
      position.at,
      position.anchor ?? "center",
      inset
    ),
    facing,
    position.elevation
  )
}

function resolveCenterOn(
  position: CenterOnPosition,
  asset: AssetSpec,
  bounds: Aabb3,
  ctx: PlacementContext,
  self: string | undefined
): Pose {
  const offset: Point = [position.dx ?? 0, position.dz ?? 0]
  const elevation = () =>
    elevationFor(asset, bounds, ctx, "centerOn", position.elevation)

  if (position.placement !== undefined && position.feature !== undefined) {
    throw new PlacementError(
      "AMBIGUOUS_TARGET",
      `centerOn takes a placement or a feature, not both (got placement '${position.placement}' and feature ${position.feature}).`
    )
  }

  if (position.placement !== undefined) {
    const id = position.placement
    if (id === self) {
      throw new PlacementError(
        "SELF_TARGET",
        `'${id}' can't be centred on itself; use nudge to shift it, or centre it on another placement.`
      )
    }
    const target = ctx.placements.find((p) => p.id === id)
    if (!target) {
      throw new PlacementError(
        "UNKNOWN_PLACEMENT",
        `No placement with id '${id}' to centre on. Existing ids: ${listIds(
          ctx.placements.map((p) => p.id),
          "none yet"
        )}.`
      )
    }
    return pose(
      [target.x + offset[0], target.z + offset[1]],
      position.facing ?? target.facing,
      elevation()
    )
  }

  if (position.feature !== undefined) {
    const id = position.feature
    const feature = ctx.room.features.find((f) => f.id === id)
    if (!feature) {
      throw new PlacementError(
        "UNKNOWN_FEATURE",
        `Feature ${id} doesn't exist. This room's features are: ${listIds(
          ctx.room.features.map((f) => f.id),
          "none"
        )}.`
      )
    }
    if (isWallFeature(feature)) {
      throw new PlacementError(
        "WALL_FEATURE_TARGET",
        `${id} is a ${feature.type} on wall ${feature.wall}, so there's nothing to centre on. Use mode "against" or "onWall" with wall ${feature.wall} at ${formatMm(feature.offset + feature.width / 2)} (its middle) instead.`
      )
    }
    const featureFacing = isCeilingFeature(feature)
      ? DEFAULT_FACING
      : (feature.facing ?? DEFAULT_FACING)
    return pose(
      [feature.x + offset[0], feature.z + offset[1]],
      position.facing ?? featureFacing,
      elevation()
    )
  }

  throw new PlacementError(
    "MISSING_TARGET",
    "centerOn needs a target: give `placement` (a placement id) or `feature` (a floor or ceiling feature id such as L1)."
  )
}

/**
 * How far along the back wall the item's near edge must start so its side
 * clears the other wall by `inset` too. 90° corners give `inset`; sharper
 * corners push the item out (its front corner would hit the side wall),
 * blunter ones let it slide in.
 */
function cornerStart(angleDeg: number, inset: number, depth: number): number {
  const theta = (angleDeg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const binding = cos > 0 ? inset + depth : inset
  return (inset + binding * cos) / sin
}

function resolveInCorner(
  position: InCornerPosition,
  asset: AssetSpec,
  bounds: Aabb3,
  ctx: PlacementContext
): Pose {
  const n = ctx.walls.length
  const match = /^C([1-9][0-9]*)$/.exec(position.corner)
  const index = match ? Number(match[1]) - 1 : -1
  if (index < 0 || index >= n) {
    throw new PlacementError(
      "UNKNOWN_CORNER",
      `Corner ${position.corner} doesn't exist — this room has corners ${idRange("C", n)}.`
    )
  }
  const outgoing = ctx.walls[index]!
  const incoming = ctx.walls[(index + n - 1) % n]!
  const angle = cornerAngles(ctx.room.corners)[index]!
  if (angle >= 180 - 1e-6) {
    throw new PlacementError(
      "REFLEX_CORNER",
      `${position.corner} is an inside corner (${formatDegrees(angle)}) that points into the room, so nothing can tuck into it. Use mode "against" with ${incoming.id} or ${outgoing.id} instead.`
    )
  }

  const backWall = position.against === "incoming" ? incoming : outgoing
  const facing = roundFacing(backWall.inwardBearing)
  const extent = extentInWallFrame(backWall, bounds, facing)
  const inset = ctx.room.skirting.depth + (position.gap ?? 0)
  const start = cornerStart(angle, inset, extent.insetMax - extent.insetMin)
  const centre =
    backWall === outgoing
      ? centreAgainstWall(backWall, extent, start, "start-edge", inset)
      : centreAgainstWall(
          backWall,
          extent,
          backWall.length - start,
          "end-edge",
          inset
        )
  return pose(
    centre,
    facing,
    elevationFor(asset, bounds, ctx, "inCorner", undefined)
  )
}
