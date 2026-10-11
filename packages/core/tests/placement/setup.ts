import { expect } from "vitest"

import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_SKIRTING,
} from "../../src/fixtures"
import {
  deriveWalls,
  polygonSegmentDistance,
  type PlacementPose,
  type RoomGeometry,
} from "../../src/geometry"
import {
  placementContext,
  resolvePosition,
  worldShapes,
  type PlacementContext,
} from "../../src/placement"
import type { AssetSpec, Placement, PlacementPosition } from "../../src/schema"

// Shared fixtures for placement tests: the living room as a RoomGeometry
// and helpers that measure how far a placed item really is from a wall.

export const ROOM: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
}

export const SKIRTING_DEPTH = LIVING_ROOM_SKIRTING.depth

export function livingRoom(
  placements: readonly Placement[] = []
): PlacementContext {
  return placementContext(ROOM, placements)
}

/** Shortest distance from the placed item's footprint to a wall's plaster. */
export function gapToWall(
  pose: PlacementPose,
  asset: AssetSpec,
  wallId: string,
  room: RoomGeometry = ROOM
): number {
  const wall = deriveWalls(room.corners).find((w) => w.id === wallId)
  if (!wall) throw new Error(`no wall ${wallId}`)
  return Math.min(
    ...worldShapes(pose, asset).map((s) =>
      polygonSegmentDistance(s.footprint, wall.start, wall.end)
    )
  )
}

export function expectFlush(
  pose: PlacementPose,
  asset: AssetSpec,
  wallId: string,
  expectedGap: number,
  room: RoomGeometry = ROOM
): void {
  expect(
    Math.abs(gapToWall(pose, asset, wallId, room) - expectedGap)
  ).toBeLessThanOrEqual(0.5)
}

/** Resolve a position into a full placement (for chaining into helpers). */
export function placeAs(
  id: string,
  asset: AssetSpec,
  position: PlacementPosition,
  options: { mirrored?: boolean; ctx?: PlacementContext } = {}
): Placement {
  const pose = resolvePosition(position, asset, options.ctx ?? livingRoom(), {
    mirrored: options.mirrored ?? false,
  })
  return {
    id,
    assetId: id,
    ...pose,
    ...(options.mirrored ? { mirrored: true } : {}),
  }
}
