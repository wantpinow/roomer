import { degToRad, type Point, rotateClockwise } from "@roomer/core/geometry"

import { type RoomShell, shellBounds } from "./room-geometry"
import { toMetres } from "./types"
import type { Vec3 } from "./views"

// Where the clay pass's "sun" comes from: in through the room's biggest
// window, angled across the room so it throws a patch of light on the floor
// rather than straight down the axis. Rooms without windows get a fixed
// high sun (it only reaches in when the ceiling is hidden).

export const SUN = {
  /** Degrees above the horizon, seen from inside (ceiling on). */
  elevation: 38,
  /** Degrees above the horizon when the ceiling is off (top, orbit). */
  overheadElevation: 58,
  /** Plan rotation away from the window's normal, degrees clockwise. */
  skew: 25,
  /** Fallback when there is no window: bearing the light travels towards. */
  fallbackBearing: 160,
  fallbackElevation: 55,
} as const

export interface SunSetup {
  /** Unit vector the light travels along (from the sun into the room). */
  direction: Vec3
  /** Light position and target in metres; the shadow camera looks between them. */
  position: Vec3
  target: Vec3
  /** Half-size of the orthographic shadow frustum, metres. */
  shadowHalfSize: number
  shadowNear: number
  shadowFar: number
  /** The window the light comes through, if any. */
  window?: string
}

/**
 * `overhead` is for views without a ceiling: the sun climbs so walls throw
 * short shadows instead of striping the floor.
 */
export function sunSetup(
  shell: RoomShell,
  { overhead = false }: { overhead?: boolean } = {}
): SunSetup {
  const b = shellBounds(shell)
  const centre: Vec3 = [
    toMetres((b.minX + b.maxX) / 2),
    0,
    toMetres((b.minZ + b.maxZ) / 2),
  ]
  const diagonal = Math.hypot(
    toMetres(b.maxX - b.minX),
    toMetres(b.maxY - b.minY),
    toMetres(b.maxZ - b.minZ)
  )
  const biggest = [...shell.windows].sort(
    (p, q) => q.width * q.height - p.width * p.height
  )[0]
  let plan: Point
  let elevation: number
  if (biggest) {
    plan = rotateClockwise(biggest.inward, SUN.skew)
    elevation = overhead ? SUN.overheadElevation : SUN.elevation
  } else {
    const r = degToRad(SUN.fallbackBearing)
    plan = [Math.sin(r), -Math.cos(r)]
    elevation = SUN.fallbackElevation
  }
  const e = degToRad(elevation)
  const direction: Vec3 = [
    plan[0] * Math.cos(e),
    -Math.sin(e),
    plan[1] * Math.cos(e),
  ]
  const distance = diagonal + 5
  const position: Vec3 = [
    centre[0] - direction[0] * distance,
    centre[1] - direction[1] * distance,
    centre[2] - direction[2] * distance,
  ]
  return {
    direction,
    position,
    target: centre,
    shadowHalfSize: diagonal / 2 + 0.5,
    shadowNear: 0.1,
    shadowFar: distance + diagonal,
    ...(biggest ? { window: biggest.feature } : {}),
  }
}
