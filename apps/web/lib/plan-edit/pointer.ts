// Pointer maths for the plan: screen pixels → plan millimetres, and the
// drag gesture built on it.

import { snapPoint } from "./snap"

/** The six numbers of a 2D affine matrix, as DOMMatrix exposes them. */
export interface AffineMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

/**
 * Maps a client (screen) point into the plan's user space with the
 * inverse of the SVG's screen CTM (`svg.getScreenCTM().inverse()`). The plan
 * SVG's user units are room millimetres, so the result is (x, z) in mm.
 */
export function toPlanPoint(
  inverseScreenCtm: AffineMatrix,
  clientX: number,
  clientY: number
): [number, number] {
  const m = inverseScreenCtm
  return [
    m.a * clientX + m.c * clientY + m.e,
    m.b * clientX + m.d * clientY + m.f,
  ]
}

/** Pixels the pointer must travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 3

export function exceedsDragThreshold(
  dxPx: number,
  dyPx: number,
  threshold: number = DRAG_THRESHOLD_PX
): boolean {
  return Math.hypot(dxPx, dyPx) >= threshold
}

export interface DragStart {
  /** The item's centre when the drag began, mm. */
  origin: readonly [number, number]
  /** Where the pointer grabbed it, mm. */
  grab: readonly [number, number]
}

/**
 * The item's new centre for a pointer position: it keeps the offset at which
 * it was grabbed, then snaps to the grid (or just to whole mm when `free`).
 */
export function dragTarget(
  start: DragStart,
  pointer: readonly [number, number],
  options: { free?: boolean; grid?: number } = {}
): [number, number] {
  return snapPoint(
    [
      start.origin[0] + (pointer[0] - start.grab[0]),
      start.origin[1] + (pointer[1] - start.grab[1]),
    ],
    options
  )
}
