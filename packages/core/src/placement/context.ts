import type { RoomGeometry } from "../geometry/room-geometry"
import { deriveWalls, type Wall } from "../geometry/walls"
import type { Placement } from "../schema"

// What resolving a placement needs to know about its surroundings: the room
// (corners, skirting, ceiling, features), its derived walls, and the current
// placements (targets for `centerOn`).

export interface PlacementContext {
  room: RoomGeometry
  walls: readonly Wall[]
  placements: readonly Placement[]
}

/** A resolved position: what a placement stores besides ids and labels. */
export type Pose = Pick<Placement, "x" | "z" | "facing" | "elevation">

export function placementContext(
  room: RoomGeometry,
  placements: readonly Placement[] = []
): PlacementContext {
  return { room, walls: deriveWalls(room.corners), placements }
}
