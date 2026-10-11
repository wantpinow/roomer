// The first-person lens. People take in roughly 100–110° horizontally at a
// glance (first-person games use 90–110°), so the walk view aims for that
// HORIZONTAL field of view and derives the vertical one from the viewport's
// shape. The vertical angle is capped at 70°: more than that shows a lot of
// floor at your feet and ceiling overhead, which reads as standing too high
// (users said exactly that at ~80°). On squarer viewports the view is
// therefore a little narrower than the target — width goes sideways, never
// up and down.

/** Horizontal field of view for walking, degrees. */
export const WALK_HFOV = 105
/** Bounds for the derived vertical field of view, degrees. */
export const WALK_VFOV_MIN = 60
export const WALK_VFOV_MAX = 70

/**
 * Vertical field of view (degrees) that shows `hfov` degrees across a
 * viewport with the given aspect ratio (width / height), clamped to
 * [min, max].
 */
export function verticalFovFor(
  hfov: number,
  aspect: number,
  min = WALK_VFOV_MIN,
  max = WALK_VFOV_MAX
): number {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return min
  const halfH = (hfov * Math.PI) / 360
  const vfov = (2 * Math.atan(Math.tan(halfH) / aspect) * 180) / Math.PI
  return Math.min(max, Math.max(min, vfov))
}

/** Horizontal field of view (degrees) a vertical fov gives at an aspect. */
export function horizontalFovFor(vfov: number, aspect: number): number {
  const halfV = (vfov * Math.PI) / 360
  return (2 * Math.atan(Math.tan(halfV) * aspect) * 180) / Math.PI
}
