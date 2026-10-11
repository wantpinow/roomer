import { defaultCameras } from "../cameras/defaults"
import type { RoomGeometry } from "../geometry/room-geometry"
import type { Camera } from "../schema"

// A room's default cameras (one per doorway and convex corner) follow its
// outline and doors. When either changes, the cameras that are still exactly
// as generated are regenerated; any camera the agent or user added or edited
// is kept as it is.

type CameraRoom = Pick<RoomGeometry, "corners" | "features" | "ceilingHeight">

function sameCamera(a: Camera, b: Camera): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.fov === b.fov &&
    a.position.every((value, i) => value === b.position[i]) &&
    a.target.every((value, i) => value === b.target[i])
  )
}

/**
 * The cameras for `next`: fresh defaults for it, followed by every camera in
 * `cameras` that isn't an untouched default of `previous`. A fresh default
 * whose id a kept camera already uses is left out.
 */
export function syncDefaultCameras(
  previous: CameraRoom,
  next: CameraRoom,
  cameras: readonly Camera[]
): Camera[] {
  const generated = defaultCameras(previous)
  const kept = cameras.filter(
    (camera) => !generated.some((auto) => sameCamera(auto, camera))
  )
  const keptIds = new Set(kept.map((camera) => camera.id))
  return [
    ...defaultCameras(next).filter((camera) => !keptIds.has(camera.id)),
    ...kept,
  ]
}
