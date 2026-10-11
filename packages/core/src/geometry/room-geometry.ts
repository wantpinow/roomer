import type { RoomSpec, Vec2 } from "../schema"

/**
 * The parts of a room that geometry, placement, lint and the plan renderer
 * need, with the solved corners pulled out of `shell`. Everything that
 * consumes a room takes this shape so callers can pass a stored room doc
 * through `toRoomGeometry` without copying fields by hand.
 */
export type RoomGeometry = Pick<
  RoomSpec,
  "ceilingHeight" | "skirting" | "features"
> & {
  corners: Vec2[]
}

export function toRoomGeometry(
  room: Pick<RoomSpec, "shell" | "ceilingHeight" | "skirting" | "features">
): RoomGeometry {
  return {
    corners: room.shell.corners,
    ceilingHeight: room.ceilingHeight,
    skirting: room.skirting,
    features: room.features,
  }
}
