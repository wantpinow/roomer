import { degToRad, type Point } from "../geometry/angles"
import { signedArea } from "../geometry/polygon"
import type { ExtrudePart, LathePart, TorusPart } from "../schema"

// Shape math shared by bounds, collision and the 3D scene, so all three agree
// on exactly what a part is: partial revolves (lathe and torus arcs),
// bevelled extrusions (as a stack of inset rings), and polygon offsetting.
//
// Revolve angles: 0° = +z (the item's front), increasing towards +x; a point
// at angle φ and radius r sits at (r·sin φ, r·cos φ) in local (x, z). That is
// three.js LatheGeometry's own convention (phiStart = 0 at +z).

/** A partial revolve, in degrees. `length` is in (0, 360). */
export interface Arc {
  start: number
  length: number
}

/** Segments per quarter circle of an extrude bevel (core and scene). */
export const BEVEL_SEGMENTS = 6

/** Longest miter, in multiples of the offset distance (stops spikes). */
export const MITER_LIMIT = 4

function partialArc(start: number, length: number): Arc | undefined {
  return length >= 360 ? undefined : { start, length }
}

/** The lathe's arc, or undefined for a full revolve. */
export function latheArc(part: Pick<LathePart, "arc">): Arc | undefined {
  return part.arc ? partialArc(part.arc[0], part.arc[1]) : undefined
}

/** The torus's arc (it starts at +z), or undefined for a full ring. */
export function torusArc(part: Pick<TorusPart, "arc">): Arc | undefined {
  return part.arc === undefined ? undefined : partialArc(0, part.arc)
}

/** Is angle φ (degrees) on the arc? */
export function onArc(phi: number, arc: Arc): boolean {
  const along = (((phi - arc.start) % 360) + 360) % 360
  return along <= arc.length + 1e-9
}

/**
 * Range of a·sin φ + b·cos φ for φ over the arc (or a full turn). This is
 * how far along one world axis a revolved point of unit radius reaches, with
 * (a, b) the rotation matrix's x and z entries for that axis.
 */
export function sinusoidRange(
  a: number,
  b: number,
  arc?: Arc
): { min: number; max: number } {
  const amplitude = Math.hypot(a, b)
  if (!arc) return { min: -amplitude, max: amplitude }
  const value = (phi: number) =>
    a * Math.sin(degToRad(phi)) + b * Math.cos(degToRad(phi))
  const peak = (Math.atan2(a, b) * 180) / Math.PI
  const values = [value(arc.start), value(arc.start + arc.length)]
  if (onArc(peak, arc)) values.push(amplitude)
  if (onArc(peak + 180, arc)) values.push(-amplitude)
  return { min: Math.min(...values), max: Math.max(...values) }
}

/** Evenly spaced angles from the arc's start to its end (both included). */
export function arcAngles(arc: Arc, maxStep: number): number[] {
  const steps = Math.max(1, Math.ceil(arc.length / maxStep - 1e-9))
  return Array.from(
    { length: steps + 1 },
    (_, i) => arc.start + (arc.length * i) / steps
  )
}

/** A profile without repeated neighbours or a repeated closing point. */
export function cleanProfile(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const point of points) {
    const last = out[out.length - 1]
    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
      out.push([point[0], point[1]])
    }
  }
  const first = out[0]
  const last = out[out.length - 1]
  if (out.length > 1 && first && last) {
    if (first[0] === last[0] && first[1] === last[1]) out.pop()
  }
  return out
}

/**
 * Offsets a simple polygon by `distance` (> 0 grows it, < 0 insets it) with
 * mitred corners, keeping one point per input point. Very sharp corners are
 * capped at MITER_LIMIT × distance so they don't spike.
 */
export function offsetPolygon(
  polygon: readonly Point[],
  distance: number
): Point[] {
  const n = polygon.length
  if (n < 3 || distance === 0) return polygon.map(([u, v]) => [u, v])
  // Outward normal of edge (du, dv): (dv, −du) for a positive-area outline.
  const sign = signedArea(polygon) >= 0 ? 1 : -1
  const normals = polygon.map((p, i): Point => {
    const q = polygon[(i + 1) % n]!
    const du = q[0] - p[0]
    const dv = q[1] - p[1]
    const length = Math.hypot(du, dv) || 1
    return [(sign * dv) / length, (-sign * du) / length]
  })
  return polygon.map((p, i): Point => {
    const before = normals[(i - 1 + n) % n]!
    const after = normals[i]!
    const denominator = 1 + before[0] * after[0] + before[1] * after[1]
    let mu: number
    let mv: number
    if (denominator < 1e-9) {
      // The outline doubles back on itself here: push straight out.
      mu = after[0]
      mv = after[1]
    } else {
      mu = (before[0] + after[0]) / denominator
      mv = (before[1] + after[1]) / denominator
    }
    const length = Math.hypot(mu, mv)
    if (length > MITER_LIMIT) {
      mu = (mu / length) * MITER_LIMIT
      mv = (mv / length) * MITER_LIMIT
    }
    return [p[0] + distance * mu, p[1] + distance * mv]
  })
}

/** One cross-section of an extrusion: the outline at axial position `e`. */
export interface ExtrudeRing {
  points: Point[]
  /** Position along the extrusion axis, relative to the part's centre. */
  e: number
}

/**
 * An extrude as a stack of outlines from −depth/2 to +depth/2. Without a
 * bevel that is the profile at both ends. With one, each end gets a quarter
 * round of BEVEL_SEGMENTS steps: the end face is the profile inset by the
 * bevel, widening back to the full profile `bevel` mm in from the end — so
 * the outer size stays exactly profile × depth.
 */
export function extrudeRings(
  part: Pick<ExtrudePart, "profile" | "depth" | "bevel">
): ExtrudeRing[] {
  const profile = cleanProfile(part.profile)
  const half = part.depth / 2
  // A bevel too big for the part (which validation rejects) is shrunk so the
  // rings never turn inside out: at most half the depth and half the
  // profile's narrower side.
  const us = profile.map(([u]) => u)
  const vs = profile.map(([, v]) => v)
  const narrow =
    Math.min(
      Math.max(...us) - Math.min(...us),
      Math.max(...vs) - Math.min(...vs)
    ) / 2
  const bevel = Math.min(part.bevel ?? 0, half, narrow)
  if (bevel <= 0) {
    return [
      { points: profile, e: -half },
      { points: profile, e: half },
    ]
  }
  const quarter = (k: number) => (k / BEVEL_SEGMENTS) * (Math.PI / 2)
  const ring = (k: number, side: -1 | 1): ExtrudeRing => {
    const theta = quarter(k)
    const inset = bevel * (1 - Math.sin(theta))
    const e = side * (half - bevel + bevel * Math.cos(theta))
    return { points: offsetPolygon(profile, -inset), e }
  }
  const rings: ExtrudeRing[] = []
  for (let k = 0; k <= BEVEL_SEGMENTS; k++) rings.push(ring(k, -1))
  for (let k = BEVEL_SEGMENTS; k >= 0; k--) {
    const next = ring(k, 1)
    // A bevel of exactly depth / 2 meets in the middle: one ring, not two.
    if (Math.abs(next.e - rings[rings.length - 1]!.e) > 1e-9) rings.push(next)
  }
  return rings
}

/** Point of a revolve at angle φ (degrees), radius r, height y: local x, y, z. */
export function revolvePoint(
  phi: number,
  radius: number,
  y: number
): [number, number, number] {
  const angle = degToRad(phi)
  return [radius * Math.sin(angle), y, radius * Math.cos(angle)]
}
