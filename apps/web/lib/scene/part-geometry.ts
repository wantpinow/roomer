import type { ExtrudePart, LathePart, Part } from "@roomer/core"
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Shape,
  SphereGeometry,
  Vector2,
} from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"

import { toMetres } from "./types"

// Asset parts → three.js geometry, in metres. Each geometry is centred on
// the part's own origin (its `position`), so a mesh only needs the pose from
// `partPose`. The shapes follow core's bounds exactly (see
// packages/core/src/assets/bounds.ts) so what is drawn is what lint checks:
// round shapes use segment counts divisible by four, which puts vertices at
// the ±radius extremes.

export const CYLINDER_SEGMENTS = 32
export const SPHERE_WIDTH_SEGMENTS = 32
export const SPHERE_HEIGHT_SEGMENTS = 16
export const LATHE_SEGMENTS = 48
export const ROUNDED_BOX_SEGMENTS = 4

/** Mesh pose of a part inside its item group: metres and radians ("XYZ"). */
export interface PartPose {
  position: [number, number, number]
  rotation: [number, number, number]
}

export function partPose(part: Part): PartPose {
  const [x, y, z] = part.position
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0]
  const deg = Math.PI / 180
  return {
    position: [toMetres(x), toMetres(y), toMetres(z)],
    rotation: [rx * deg, ry * deg, rz * deg],
  }
}

/** The part's mesh matrix (pose only — geometry is already in metres). */
export function partMatrix(part: Part): Matrix4 {
  const { position, rotation } = partPose(part)
  return new Matrix4()
    .makeRotationFromEuler(new Euler(...rotation, "XYZ"))
    .setPosition(...position)
}

/** Builds the part's geometry in metres, centred on the part's origin. */
export function partGeometry(part: Part): BufferGeometry {
  switch (part.shape) {
    case "box": {
      const [w, h, d] = part.size.map(toMetres) as [number, number, number]
      return new BoxGeometry(w, h, d)
    }
    case "roundedBox": {
      const [w, h, d] = part.size.map(toMetres) as [number, number, number]
      return new RoundedBoxGeometry(
        w,
        h,
        d,
        ROUNDED_BOX_SEGMENTS,
        toMetres(part.radius)
      )
    }
    case "cylinder":
      return new CylinderGeometry(
        toMetres(part.radiusTop),
        toMetres(part.radiusBottom),
        toMetres(part.height),
        CYLINDER_SEGMENTS
      )
    case "sphere":
      return new SphereGeometry(
        toMetres(part.radius),
        SPHERE_WIDTH_SEGMENTS,
        SPHERE_HEIGHT_SEGMENTS
      )
    case "extrude":
      return extrudeGeometry(part)
    case "lathe":
      return latheGeometry(part)
  }
}

/**
 * An extrude's profile [u, v] is drawn in the shape plane and pushed along
 * the shape's +z, then rotated so the profile lands where the schema says:
 * axis z → (x, y) front profile, y → (x, z) plan outline, x → (z, y) side
 * profile. Rotations (never mirrors) keep the faces' winding outward; the
 * depth is centred, so the sign the rotation gives the extrusion axis does
 * not matter.
 */
function extrudeGeometry(part: ExtrudePart): BufferGeometry {
  const shape = new Shape(
    part.profile.map(([u, v]) => new Vector2(toMetres(u), toMetres(v)))
  )
  const depth = toMetres(part.depth)
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  switch (part.axis) {
    case "z":
      break
    case "y":
      // (u, v, e) → (u, −e, v)
      geometry.rotateX(Math.PI / 2)
      break
    case "x":
      // (u, v, e) → (−e, v, u)
      geometry.rotateY(-Math.PI / 2)
      break
  }
  return geometry
}

/** A lathe revolves its [radius, y] half-profile about the local y axis. */
function latheGeometry(part: LathePart): BufferGeometry {
  return new LatheGeometry(
    part.profile.map(([r, y]) => new Vector2(toMetres(r), toMetres(y))),
    LATHE_SEGMENTS
  )
}

/** Lathes are open surfaces whose winding follows the profile's direction. */
export function partIsDoubleSided(part: Part): boolean {
  return part.shape === "lathe"
}
