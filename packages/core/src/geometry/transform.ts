import type { Placement } from "../schema"
import { degToRad, type Point } from "./angles"

// Item-local ↔ room-space transforms. Local: origin at footprint centre on
// the floor, +z = front, x = width (left = −x as seen facing the item), y up.
// rotationY = 180° − facing (three.js convention, rotation about +y).

export type PlacementPose = Pick<
  Placement,
  "x" | "z" | "facing" | "elevation"
> & {
  mirrored?: boolean | undefined
}

export interface PlacementTransform {
  /** three.js rotation about +y, radians. */
  rotationY: number
  /** Local (lx, lz) → room-space plan point (ignores height). */
  toPlan(lx: number, lz: number): Point
  /** Local (lx, ly, lz) → room-space [x, y, z]. */
  toWorld(lx: number, ly: number, lz: number): [number, number, number]
  /** Room-space plan point → local (lx, lz). */
  toLocal(px: number, pz: number): Point
}

export function placementTransform(pose: PlacementPose): PlacementTransform {
  const phi = degToRad(180 - pose.facing)
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  const mx = pose.mirrored ? -1 : 1

  const toPlan = (lx: number, lz: number): Point => {
    const x = lx * mx
    return [pose.x + x * c + lz * s, pose.z - x * s + lz * c]
  }

  return {
    rotationY: phi,
    toPlan,
    toWorld(lx, ly, lz) {
      const [x, z] = toPlan(lx, lz)
      return [x, pose.elevation + ly, z]
    },
    toLocal(px, pz) {
      const dx = px - pose.x
      const dz = pz - pose.z
      // Inverse rotation, then undo the mirror.
      const x = dx * c - dz * s
      const z = dx * s + dz * c
      return [x * mx, z]
    },
  }
}

/** Plan outline of an axis-aligned local rectangle, transformed to room space. */
export function localRectToPlan(
  transform: PlacementTransform,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number
): Point[] {
  const corners: Point[] = [
    transform.toPlan(minX, minZ),
    transform.toPlan(maxX, minZ),
    transform.toPlan(maxX, maxZ),
    transform.toPlan(minX, maxZ),
  ]
  return corners
}
