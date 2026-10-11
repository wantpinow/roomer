import type { Point } from "./angles"

// Tiny 2D vector helpers on [x, z] tuples. Kept dependency-free so they run
// in Convex, the browser and Node alike.

export function add(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1]]
}

export function sub(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1]]
}

export function scale(a: Point, k: number): Point {
  return [a[0] * k, a[1] * k]
}

export function dot(a: Point, b: Point): number {
  return a[0] * b[0] + a[1] * b[1]
}

/** z-component of the 3D cross product; > 0 means b is clockwise of a on the plan. */
export function cross(a: Point, b: Point): number {
  return a[0] * b[1] - a[1] * b[0]
}

export function length(a: Point): number {
  return Math.hypot(a[0], a[1])
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function normalize(a: Point): Point {
  const len = length(a)
  if (len === 0) throw new Error("Cannot normalise a zero-length vector")
  return [a[0] / len, a[1] / len]
}

/** Rotate a plan vector clockwise on the plan by `degrees`. */
export function rotateClockwise(a: Point, degrees: number): Point {
  const r = (degrees * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  // With z pointing down the page, a clockwise screen rotation is the
  // standard counter-clockwise matrix in (x, z).
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]
}

export function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Round to whole millimetres (for storing resolved positions). */
export function roundPoint(a: Point): Point {
  return [Math.round(a[0]) || 0, Math.round(a[1]) || 0]
}
