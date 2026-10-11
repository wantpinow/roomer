import {
  type BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  Vector2,
} from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

import type { ShellSolid } from "./room-geometry"
import { toMetres } from "./types"

// Shell solids (room-space mm) → three.js geometry in room-space metres.
// Geometry is positioned absolutely, so the shell needs no per-mesh
// transforms and solids that share a material can be merged into one draw.

export const SHELL_CYLINDER_SEGMENTS = 24

export function solidGeometry(solid: ShellSolid): BufferGeometry {
  const y0 = toMetres(solid.y0)
  const height = toMetres(solid.y1 - solid.y0)
  if (solid.kind === "cylinder") {
    const radius = toMetres(solid.radius)
    const geometry = new CylinderGeometry(
      radius,
      radius,
      height,
      SHELL_CYLINDER_SEGMENTS
    )
    geometry.translate(
      toMetres(solid.center[0]),
      y0 + height / 2,
      toMetres(solid.center[1])
    )
    return geometry.toNonIndexed()
  }
  // The shape plane is (x, −z): extruding along +z and rotating −90° about x
  // stands the prism up (shape z → +y) and turns −z back into plan z.
  const shape = new Shape(
    solid.footprint.map(([x, z]) => new Vector2(toMetres(x), -toMetres(z)))
  )
  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  })
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, y0, 0)
  return geometry
}

/** One geometry for many solids (one draw call), or null when there are none. */
export function mergedSolidGeometry(
  solids: readonly ShellSolid[]
): BufferGeometry | null {
  if (solids.length === 0) return null
  const parts = solids.map(solidGeometry)
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error("Could not merge shell geometry")
  return merged
}
