import { degToRad, radToDeg } from "@roomer/core/geometry"

import type { Vec3 } from "./views"

// Fisheye cameras, as pure maths. The renderer can only draw rectilinear
// (pinhole) images, so a fisheye picture is made in two steps: draw a wider
// rectilinear "source" view, then remap every output pixel to the source
// pixel its ray hits. The output uses the stereographic projection,
// r = 2f·tan(θ/2): it is conformal (furniture keeps its shape, only lines
// bend), so near-side items stay recognisable at the edges of a very wide
// view — the gentlest fisheye for interiors.
//
// Conventions: output pixel offsets (dx right, dy up) from the image
// centre, in pixels; camera space x right, y up, z forward (along the
// optical axis).

export const FISHEYE = {
  /**
   * Widest source the remap asks for, as tan of the half-angle (≈ 80.5°).
   * Rays further out (the corners of a very wide view) show the background,
   * like a real fisheye's dark corners.
   */
  maxTan: 6,
  /** Largest source image side, px (GPU memory and render time). */
  maxSourceSize: 4096,
  /**
   * Source pixels per output pixel on the optical axis, where the
   * stereographic image is most magnified relative to the source.
   */
  supersample: 1.25,
} as const

/** Focal length (px) that puts the top edge of the image at `fov`/2. */
export function stereographicFocal(height: number, fov: number): number {
  return height / 2 / (2 * Math.tan(degToRad(fov) / 4))
}

/** Angle from the optical axis (radians) of a point `r` px from the centre. */
export function stereographicAngle(r: number, focal: number): number {
  return 2 * Math.atan(r / (2 * focal))
}

/** Distance from the centre (px) of a ray `theta` radians off-axis. */
export function stereographicRadius(theta: number, focal: number): number {
  return 2 * focal * Math.tan(theta / 2)
}

/** Unit camera-space ray through the output pixel at offset (dx, dy). */
export function fisheyeRay(dx: number, dy: number, focal: number): Vec3 {
  const r = Math.hypot(dx, dy)
  if (r === 0) return [0, 0, 1]
  const theta = stereographicAngle(r, focal)
  const s = Math.sin(theta) / r
  return [dx * s, dy * s, Math.cos(theta)]
}

/**
 * Where a ray meets a rectilinear image plane at z = 1: (x/z, y/z), the
 * "tangent coordinates" a pinhole camera sees. Null for rays at or behind
 * 90° (no rectilinear view can show them).
 */
export function planeTangent([x, y, z]: Vec3): [number, number] | null {
  if (z <= 1e-9) return null
  return [x / z, y / z]
}

/**
 * The tangent half-extents a rectilinear source must cover so every pixel
 * of a `width × height` stereographic image (focal `focal`) has something
 * to sample, capped at `maxTan`. Both grow monotonically towards the
 * image's edge, so the corners decide.
 */
export function rectilinearCoverage(
  width: number,
  height: number,
  focal: number,
  maxTan: number = FISHEYE.maxTan
): { tanHalfH: number; tanHalfV: number } {
  const tangent = planeTangent(fisheyeRay(width / 2, height / 2, focal))
  if (!tangent) return { tanHalfH: maxTan, tanHalfV: maxTan }
  return {
    tanHalfH: Math.min(maxTan, tangent[0]),
    tanHalfV: Math.min(maxTan, tangent[1]),
  }
}

export interface FisheyePlan {
  /** Output size, px. */
  width: number
  height: number
  /** Output vertical field of view, degrees. */
  fov: number
  /** Stereographic focal length of the output, px. */
  focal: number
  /** Tangent half-extents the source covers (horizontal from its aspect). */
  tanHalfH: number
  tanHalfV: number
  /** The rectilinear source render. */
  sourceWidth: number
  sourceHeight: number
  /** The source camera's vertical field of view, degrees. */
  sourceFov: number
}

/** How to render a fisheye image of `width × height` with vertical `fov`. */
export function planFisheye(
  width: number,
  height: number,
  fov: number,
  {
    maxTan = FISHEYE.maxTan,
    maxSourceSize = FISHEYE.maxSourceSize,
    supersample = FISHEYE.supersample,
  }: { maxTan?: number; maxSourceSize?: number; supersample?: number } = {}
): FisheyePlan {
  const focal = stereographicFocal(height, fov)
  const cover = rectilinearCoverage(width, height, focal, maxTan)
  // A rectilinear image samples tangent space evenly: match the output's
  // density on the axis (focal px per radian = px per unit tangent there).
  let sourceWidth = 2 * focal * supersample * cover.tanHalfH
  let sourceHeight = 2 * focal * supersample * cover.tanHalfV
  const shrink = Math.min(
    1,
    maxSourceSize / Math.max(sourceWidth, sourceHeight)
  )
  sourceWidth = Math.max(16, Math.round(sourceWidth * shrink))
  sourceHeight = Math.max(16, Math.round(sourceHeight * shrink))
  const tanHalfV = cover.tanHalfV
  return {
    width,
    height,
    fov,
    focal,
    // The source camera is set by vertical fov and aspect, so derive the
    // horizontal extent from the rounded size to match it exactly.
    tanHalfH: tanHalfV * (sourceWidth / sourceHeight),
    tanHalfV,
    sourceWidth,
    sourceHeight,
    sourceFov: radToDeg(2 * Math.atan(tanHalfV)),
  }
}

/**
 * The source texture coordinate (0–1, origin bottom-left) an output pixel
 * samples, or null where the ray falls outside the source (background).
 * The remap shader does exactly this per pixel; this is its reference.
 */
export function fisheyeSourceUv(
  plan: FisheyePlan,
  px: number,
  py: number
): [number, number] | null {
  const tangent = planeTangent(
    fisheyeRay(px - plan.width / 2, py - plan.height / 2, plan.focal)
  )
  if (!tangent) return null
  const u = 0.5 + (0.5 * tangent[0]) / plan.tanHalfH
  const v = 0.5 + (0.5 * tangent[1]) / plan.tanHalfV
  if (u < 0 || u > 1 || v < 0 || v > 1) return null
  return [u, v]
}
