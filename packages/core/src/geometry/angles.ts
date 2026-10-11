// Bearings and rotations. See docs/2026-10-11-v1-architecture.md §3.1:
// bearing 0 = up the page (−z), 90 = right (+x), 180 = down (+z), 270 = left.

/** A float point on the plan: [x, z] in mm. */
export type Point = [number, number]

const DEG = Math.PI / 180

export function degToRad(degrees: number): number {
  return degrees * DEG
}

export function radToDeg(radians: number): number {
  return radians / DEG
}

/** Normalise any angle to [0, 360), rounding away float noise (1e-9°). */
export function normalizeBearing(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360
  const cleaned = Math.round(wrapped * 1e9) / 1e9
  return cleaned >= 360 ? 0 : cleaned
}

/** Bearing of a plan direction (need not be unit length). */
export function bearingOf([x, z]: Point): number {
  return normalizeBearing(radToDeg(Math.atan2(x, -z)))
}

/** Unit plan direction for a bearing. */
export function directionOf(bearing: number): Point {
  const r = degToRad(bearing)
  return [cleanZero(Math.sin(r)), cleanZero(-Math.cos(r))]
}

/**
 * three.js rotation about +y (radians) for an item whose front (local +z)
 * faces `facing`. f = 180 is the identity.
 */
export function facingToRotationY(facing: number): number {
  return degToRad(180 - facing)
}

/** Inverse of `facingToRotationY`. */
export function rotationYToFacing(rotationY: number): number {
  return normalizeBearing(180 - radToDeg(rotationY))
}

/** Smallest absolute difference between two bearings, in [0, 180]. */
export function bearingDelta(a: number, b: number): number {
  const d = Math.abs(normalizeBearing(a) - normalizeBearing(b))
  return d > 180 ? 360 - d : d
}

function cleanZero(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value
}
