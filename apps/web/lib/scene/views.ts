import type { WallId } from "@roomer/core"
import type { Aabb3 } from "@roomer/core/assets"
import { degToRad, directionOf, type Point } from "@roomer/core/geometry"

import { type RoomShell, shellBounds, wallsFacingAway } from "./room-geometry"
import type { AssetPreviewView, CameraView } from "./types"
import { toMetres } from "./types"

// Camera placement for every view, as plain numbers in metres so it can be
// tested without WebGL. The scene turns a `CameraSetup` into a three.js
// camera; nothing else about the view lives in components.

export type Vec3 = [number, number, number]

interface SetupCommon {
  position: Vec3
  target: Vec3
  up: Vec3
  near: number
  far: number
}

export interface PerspectiveSetup extends SetupCommon {
  kind: "perspective"
  /** Vertical field of view, degrees. */
  fov: number
}

export interface OrthographicSetup extends SetupCommon {
  kind: "orthographic"
  /** Half the visible width / height at the target, metres. */
  halfWidth: number
  halfHeight: number
}

export type CameraSetup = PerspectiveSetup | OrthographicSetup

export interface RoomViewSetup {
  camera: CameraSetup
  /** Walls cut down so the camera can see in (orbit views only). */
  cutWalls: WallId[]
  /** Height (mm) the cut walls are cut down to. */
  cutHeight: number
}

export const TOP_VIEW_MARGIN = 0.06
/**
 * The top view is a plan section: every wall is cut at this height (mm,
 * the architectural plan convention) so doorways and windows read as gaps.
 */
export const TOP_VIEW_CUT_HEIGHT = 1200
export const ORBIT_DEFAULTS = {
  azimuth: 225,
  elevation: 45,
  fov: 30,
  margin: 0.06,
} as const
/** How high walls facing away from an orbit camera are cut, as a share of ceiling height. */
export const ORBIT_CUT_RATIO = 1 / 3
export const PREVIEW_MARGIN = 0.1
export const PREVIEW_ISO = { azimuth: 35, elevation: 25, fov: 30 } as const

const UP: Vec3 = [0, 1, 0]
const PLAN_UP: Vec3 = [0, 0, -1]

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a))

/** Box corners (metres) of min/max points. */
export function boxCorners(min: Vec3, max: Vec3): Vec3[] {
  const corners: Vec3[] = []
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) corners.push([x, y, z])
  return corners
}

/**
 * Orthographic half-extents that show `width × height` (metres) with a
 * relative `margin` on the longer fit axis, matched to the image aspect.
 */
export function fitOrthographic(
  width: number,
  height: number,
  aspect: number,
  margin: number
): { halfWidth: number; halfHeight: number } {
  let halfWidth = (width / 2) * (1 + margin)
  let halfHeight = (height / 2) * (1 + margin)
  if (halfWidth / halfHeight < aspect) halfWidth = halfHeight * aspect
  else halfHeight = halfWidth / aspect
  return { halfWidth, halfHeight }
}

/** Camera basis for a camera looking along `forward` with world up `up`. */
export function cameraBasis(
  forward: Vec3,
  up: Vec3 = UP
): { right: Vec3; up: Vec3; forward: Vec3 } {
  const f = normalize(forward)
  const right = normalize(cross(f, up))
  return { right, up: cross(right, f), forward: f }
}

/** Projects points into normalised device x/y for a perspective camera. */
export function projectNdc(
  points: readonly Vec3[],
  position: Vec3,
  target: Vec3,
  fov: number,
  aspect: number
): { x: number; y: number; depth: number }[] {
  const { right, up, forward } = cameraBasis(sub(target, position))
  const tanV = Math.tan(degToRad(fov) / 2)
  const tanH = tanV * aspect
  return points.map((p) => {
    const v = sub(p, position)
    const depth = dot(v, forward)
    return {
      x: dot(v, right) / (depth * tanH),
      y: dot(v, up) / (depth * tanV),
      depth,
    }
  })
}

/**
 * Perspective framing: looks along `-direction` (direction = unit vector
 * from the subject to the camera) and fits every point inside the frame
 * with `margin` to spare, re-centring the target on the projected extent.
 */
export function fitPerspective(
  points: readonly Vec3[],
  direction: Vec3,
  fov: number,
  aspect: number,
  margin: number
): { position: Vec3; target: Vec3; distance: number } {
  const dir = normalize(direction)
  const { right, up } = cameraBasis(scale(dir, -1))
  const n = points.length
  let target: Vec3 = scale(
    points.reduce((acc, p) => add(acc, p), [0, 0, 0] as Vec3),
    1 / n
  )
  const radius = Math.max(...points.map((p) => Math.hypot(...sub(p, target))))
  const tanV = Math.tan(degToRad(fov) / 2)
  const tanH = tanV * aspect
  const limit = 1 / (1 + margin)
  let distance = radius / Math.sin(Math.atan(Math.min(tanV, tanH))) + radius
  for (let i = 0; i < 12; i++) {
    const position = add(target, scale(dir, distance))
    const ndc = projectNdc(points, position, target, fov, aspect)
    const xs = ndc.map((p) => p.x)
    const ys = ndc.map((p) => p.y)
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
    target = add(
      target,
      add(
        scale(right, ((minX + maxX) / 2) * distance * tanH),
        scale(up, ((minY + maxY) / 2) * distance * tanV)
      )
    )
    const extent = Math.max((maxX - minX) / 2, (maxY - minY) / 2)
    distance *= 0.35 + 0.65 * (extent / limit)
  }
  // Settle: back off until everything is inside the margin.
  for (let i = 0; i < 40; i++) {
    const position = add(target, scale(dir, distance))
    const ndc = projectNdc(points, position, target, fov, aspect)
    const worst = Math.max(
      ...ndc.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))
    )
    if (worst <= limit && ndc.every((p) => p.depth > 0)) break
    distance *= 1.02
  }
  return { position: add(target, scale(dir, distance)), target, distance }
}

/** Direction from a subject towards a camera at plan `bearing`, `elevation` degrees up. */
export function viewDirection(bearing: number, elevation: number): Vec3 {
  const [x, z] = directionOf(bearing)
  const e = degToRad(elevation)
  return [x * Math.cos(e), Math.sin(e), z * Math.cos(e)]
}

export function roomViewSetup(
  view: CameraView,
  shell: RoomShell,
  aspect: number
): RoomViewSetup {
  const b = shellBounds(shell)
  const min: Vec3 = [toMetres(b.minX), toMetres(b.minY), toMetres(b.minZ)]
  const max: Vec3 = [toMetres(b.maxX), toMetres(b.maxY), toMetres(b.maxZ)]
  const diagonal = Math.hypot(...sub(max, min))
  const centre: Vec3 = scale(add(min, max), 0.5)
  switch (view.kind) {
    case "camera": {
      const [px, py, pz] = view.camera.position
      const [tx, ty, tz] = view.camera.target
      return {
        camera: {
          kind: "perspective",
          position: [toMetres(px), toMetres(py), toMetres(pz)],
          target: [toMetres(tx), toMetres(ty), toMetres(tz)],
          up: UP,
          fov: view.camera.fov,
          near: 0.05,
          far: diagonal * 2 + 10,
        },
        cutWalls: [],
        cutHeight: shell.ceilingHeight,
      }
    }
    case "top": {
      const height = max[1] + 5
      return {
        camera: {
          kind: "orthographic",
          position: [centre[0], height, centre[2]],
          target: [centre[0], 0, centre[2]],
          up: PLAN_UP,
          ...fitOrthographic(
            max[0] - min[0],
            max[2] - min[2],
            aspect,
            TOP_VIEW_MARGIN
          ),
          near: 0.1,
          far: height - min[1] + 1,
        },
        cutWalls: shell.walls.map((wall) => wall.id),
        cutHeight: Math.min(TOP_VIEW_CUT_HEIGHT, shell.ceilingHeight),
      }
    }
    case "orbit": {
      const azimuth = view.azimuth ?? ORBIT_DEFAULTS.azimuth
      const elevation = view.elevation ?? ORBIT_DEFAULTS.elevation
      const direction = viewDirection(azimuth, elevation)
      const framed = boxCorners(min, [
        max[0],
        toMetres(shell.ceilingHeight),
        max[2],
      ])
      const { position, target, distance } = fitPerspective(
        framed,
        direction,
        ORBIT_DEFAULTS.fov,
        aspect,
        ORBIT_DEFAULTS.margin
      )
      const viewpoint: Point = [position[0] * 1000, position[2] * 1000]
      const cutWalls = wallsFacingAway(shell.walls, viewpoint)
      return {
        camera: {
          kind: "perspective",
          position,
          target,
          up: UP,
          fov: ORBIT_DEFAULTS.fov,
          near: Math.max(0.05, distance - diagonal),
          far: distance + diagonal,
        },
        cutWalls,
        cutHeight: Math.round(shell.ceilingHeight * ORBIT_CUT_RATIO),
      }
    }
  }
}

/** Camera for an asset preview, framed on the asset's bounds (mm). */
export function assetViewSetup(
  view: AssetPreviewView,
  bounds: Aabb3,
  aspect: number
): CameraSetup {
  const min: Vec3 = [
    toMetres(bounds.min[0]),
    toMetres(bounds.min[1]),
    toMetres(bounds.min[2]),
  ]
  const max: Vec3 = [
    toMetres(bounds.max[0]),
    toMetres(bounds.max[1]),
    toMetres(bounds.max[2]),
  ]
  const centre = scale(add(min, max), 0.5)
  const [w, h, d] = sub(max, min)
  const diagonal = Math.hypot(w, h, d)
  const away = diagonal + 3
  const ortho = (
    position: Vec3,
    up: Vec3,
    across: number,
    upright: number
  ): OrthographicSetup => ({
    kind: "orthographic",
    position,
    target: centre,
    up,
    ...fitOrthographic(across, upright, aspect, PREVIEW_MARGIN),
    near: 0.01,
    far: away + diagonal,
  })
  switch (view) {
    case "front":
      return ortho([centre[0], centre[1], centre[2] + away], UP, w, h)
    case "side":
      return ortho([centre[0] + away, centre[1], centre[2]], UP, d, h)
    case "top":
      return ortho([centre[0], centre[1] + away, centre[2]], PLAN_UP, w, d)
    case "iso": {
      // From front-right and above: the item's front faces +z (bearing 180),
      // so the camera's bearing from the item is 180 − azimuth.
      const direction = viewDirection(
        180 - PREVIEW_ISO.azimuth,
        PREVIEW_ISO.elevation
      )
      const { position, target, distance } = fitPerspective(
        boxCorners(min, max),
        direction,
        PREVIEW_ISO.fov,
        aspect,
        PREVIEW_MARGIN
      )
      return {
        kind: "perspective",
        position,
        target,
        up: UP,
        fov: PREVIEW_ISO.fov,
        near: Math.max(0.01, distance - diagonal),
        far: distance + diagonal,
      }
    }
  }
}
