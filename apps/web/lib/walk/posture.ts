import type { AssetCategory } from "@roomer/core"
import {
  bearingOf,
  containsPoint,
  directionOf,
  type Point,
} from "@roomer/core/geometry"

import { closestBoundaryPoint } from "./collide"
import { type Collider, groundAt, type WalkWorld } from "./world"

// Sitting and lying down, furniture-aware. Sitting looks for a seat within
// reach — a sofa cushion, a chair seat, a bench top — and sits on it facing
// the way the furniture faces (on the sofa you face the TV); lying looks
// for a sofa, bed or bench long enough and lies along it on your back.
// With nothing suitable in reach you sit or lie on the floor (or rug).
// Pure: the viewer eases the camera to the target and back.

export const POSTURE = {
  /** How far (mm) from the walker a seat or bed may be, to its outline. */
  reach: 900,
  seat: {
    /** Seat tops between these heights (mm) count. */
    minTop: 350,
    maxTop: 650,
    /** Narrowest side (mm) a seat may have: a cushion, not an arm. */
    minSide: 350,
    /** Sit this far (mm) in from the seat's edges. */
    inset: 150,
  },
  lie: {
    /** Highest top (mm) to lie on. */
    maxTop: 700,
    /** Shortest long side (mm) to lie along. */
    minLength: 1500,
    /** Eyes this far (mm) above what you lie on. */
    eyeAbove: 180,
    /** Head this far (mm) in from the end. */
    headInset: 250,
    /** Looking up at the ceiling, degrees. */
    pitch: 70,
  },
  /** Seated eye height above the seat, as a share of stature. */
  seatedEyeRatio: 0.44,
  /** On the floor you sit a little lower (legs out, no seat to perch on). */
  floorSitRatio: 0.95,
} as const

/** Categories that are seats first; anything else is a fallback. */
const SEAT_CATEGORIES: readonly AssetCategory[] = ["sofa", "chair"]
/** Never sat on, whatever their height. */
const NEVER_SEATS: readonly AssetCategory[] = ["table"]
/** Lain on (plus anything called a bench). */
const BED_CATEGORIES: readonly AssetCategory[] = ["sofa", "bed"]

export type SettledPosture = "sitting" | "lying"

export interface PostureTarget {
  posture: SettledPosture
  /** Eye position [x, y, z], mm. */
  eye: [number, number, number]
  /** Plan bearing to face, degrees. */
  heading: number
  /** Look up (+) or down (−), degrees. */
  pitch: number
  /** What you're on: a placement, or the floor (null). */
  on: { id: string; label: string } | null
  /** "Sitting on Test three-seat sofa", "Lying on the floor". */
  label: string
}

/** Eye height above a seat for a walker `statureMm` tall. */
export function seatedEyeHeight(statureMm: number): number {
  return Math.round(statureMm * POSTURE.seatedEyeRatio)
}

/** Eye height above the floor sitting on it. */
export function floorSeatedEyeHeight(statureMm: number): number {
  return Math.round(statureMm * POSTURE.seatedEyeRatio * POSTURE.floorSitRatio)
}

/**
 * A collider's footprint in its placement's own frame: u across the front
 * (width), v along the facing (depth), around the outline's centre.
 */
interface ItemFrame {
  origin: Point
  across: Point
  front: Point
  u: [number, number]
  v: [number, number]
}

function frameOf(c: Collider): ItemFrame {
  const front = directionOf(c.item?.facing ?? 180)
  const across: Point = directionOf((c.item?.facing ?? 180) + 90)
  const n = c.footprint.length
  const origin: Point = [
    c.footprint.reduce((sum, p) => sum + p[0], 0) / n,
    c.footprint.reduce((sum, p) => sum + p[1], 0) / n,
  ]
  const us: number[] = []
  const vs: number[] = []
  for (const p of c.footprint) {
    const [u, v] = toFrame({ origin, across, front }, p)
    us.push(u)
    vs.push(v)
  }
  return {
    origin,
    across,
    front,
    u: [Math.min(...us), Math.max(...us)],
    v: [Math.min(...vs), Math.max(...vs)],
  }
}

function toFrame(
  frame: Pick<ItemFrame, "origin" | "across" | "front">,
  [x, z]: Point
): Point {
  const dx = x - frame.origin[0]
  const dz = z - frame.origin[1]
  return [
    dx * frame.across[0] + dz * frame.across[1],
    dx * frame.front[0] + dz * frame.front[1],
  ]
}

function fromFrame(frame: ItemFrame, u: number, v: number): Point {
  return [
    frame.origin[0] + u * frame.across[0] + v * frame.front[0],
    frame.origin[1] + u * frame.across[1] + v * frame.front[1],
  ]
}

const sizeOf = (frame: ItemFrame) => ({
  across: frame.u[1] - frame.u[0],
  along: frame.v[1] - frame.v[0],
})

/** Horizontal distance (mm) from a point to a footprint (0 inside). */
export function distanceTo(c: Collider, p: Point): number {
  if (containsPoint(c.footprint, p)) return 0
  return closestBoundaryPoint(p, c.footprint).distance
}

const clampTo = (value: number, [lo, hi]: [number, number], inset: number) =>
  hi - lo > 2 * inset
    ? Math.min(hi - inset, Math.max(lo + inset, value))
    : (lo + hi) / 2

/**
 * The top surface (mm) a person at `point` rests on: the highest qualifying
 * part of the same placement under that point.
 */
function topAt(
  world: WalkWorld,
  chosen: Collider,
  point: Point,
  maxTop: number,
  qualifies: (c: Collider) => boolean = () => true
): number {
  let top = chosen.y1
  for (const c of world.colliders) {
    if (c.id !== chosen.id || c.walkable || c.y1 > maxTop || c.y1 <= top) {
      continue
    }
    if (containsPoint(c.footprint, point) && qualifies(c)) top = c.y1
  }
  return top
}

/** Wide enough both ways to sit on (a cushion, not an arm). */
function seatSized(c: Collider): boolean {
  const size = sizeOf(frameOf(c))
  return Math.min(size.across, size.along) >= POSTURE.seat.minSide
}

/** Where sitting down takes the walker standing at `position`. */
export function seatTarget(
  world: WalkWorld,
  position: Point,
  feet: number,
  heading: number
): PostureTarget {
  const { seat, reach } = POSTURE
  const candidates = world.colliders
    .filter(
      (c) =>
        c.item &&
        !c.walkable &&
        !NEVER_SEATS.includes(c.item.category) &&
        c.y1 >= seat.minTop &&
        c.y1 <= seat.maxTop
    )
    .map((c) => ({ c, frame: frameOf(c), distance: distanceTo(c, position) }))
    .filter(({ c, distance }) => distance <= reach && seatSized(c))
    .sort(
      (a, b) =>
        rank(a.c) - rank(b.c) ||
        Math.round(a.distance / 10) - Math.round(b.distance / 10) ||
        b.c.y1 - a.c.y1
    )
  const best = candidates[0]
  if (!best) {
    const ground = groundAt(world, position, feet)
    return {
      posture: "sitting",
      eye: [
        position[0],
        ground + floorSeatedEyeHeight(world.player.height),
        position[1],
      ],
      heading,
      pitch: 0,
      on: null,
      label: "Sitting on the floor",
    }
  }
  const { c, frame } = best
  const [u, v] = toFrame(frame, position)
  const sit = fromFrame(
    frame,
    clampTo(u, frame.u, seat.inset),
    clampTo(v, frame.v, seat.inset)
  )
  const top = topAt(world, c, sit, seat.maxTop, seatSized)
  return {
    posture: "sitting",
    eye: [sit[0], top + seatedEyeHeight(world.player.height), sit[1]],
    heading: c.item!.facing,
    pitch: 0,
    on: { id: c.id, label: c.label },
    label: `Sitting on ${c.label}`,
  }
}

function rank(c: Collider): number {
  return c.item && SEAT_CATEGORIES.includes(c.item.category) ? 0 : 1
}

function isBed(c: Collider): boolean {
  if (!c.item) return false
  return (
    BED_CATEGORIES.includes(c.item.category) ||
    /bench/i.test(c.label) ||
    /bench/i.test(c.item.part)
  )
}

/** Where lying down takes the walker standing at `position`. */
export function lieTarget(
  world: WalkWorld,
  position: Point,
  feet: number,
  heading: number
): PostureTarget {
  const { lie, reach } = POSTURE
  const best = world.colliders
    .filter((c) => isBed(c) && !c.walkable && c.y1 <= lie.maxTop)
    .map((c) => ({ c, frame: frameOf(c), distance: distanceTo(c, position) }))
    .filter(({ frame, distance }) => {
      const size = sizeOf(frame)
      return (
        distance <= reach && Math.max(size.across, size.along) >= lie.minLength
      )
    })
    .sort((a, b) => a.distance - b.distance || b.c.y1 - a.c.y1)[0]
  if (!best) {
    const ground = groundAt(world, position, feet)
    return {
      posture: "lying",
      eye: [position[0], ground + lie.eyeAbove, position[1]],
      heading,
      pitch: lie.pitch,
      on: null,
      label: "Lying on the floor",
    }
  }
  const { c, frame } = best
  const size = sizeOf(frame)
  const alongU = size.across >= size.along
  // Head at the end nearer the walker, feet towards the far end.
  const [u, v] = toFrame(frame, position)
  const axis = alongU ? frame.u : frame.v
  const mid = (axis[0] + axis[1]) / 2
  const nearLow = (alongU ? u : v) <= mid
  const head = nearLow ? axis[0] + lie.headInset : axis[1] - lie.headInset
  const centre = alongU
    ? (frame.v[0] + frame.v[1]) / 2
    : (frame.u[0] + frame.u[1]) / 2
  const eyePoint = alongU
    ? fromFrame(frame, head, centre)
    : fromFrame(frame, centre, head)
  const feetPoint = alongU
    ? fromFrame(frame, nearLow ? axis[1] : axis[0], centre)
    : fromFrame(frame, centre, nearLow ? axis[1] : axis[0])
  const top = topAt(world, c, eyePoint, lie.maxTop)
  return {
    posture: "lying",
    eye: [eyePoint[0], top + lie.eyeAbove, eyePoint[1]],
    heading: bearingOf([
      feetPoint[0] - eyePoint[0],
      feetPoint[1] - eyePoint[1],
    ]),
    pitch: lie.pitch,
    on: { id: c.id, label: c.label },
    label: `Lying on ${c.label}`,
  }
}

/** Sit or lie, from where the walker stands. */
export function postureTarget(
  world: WalkWorld,
  posture: SettledPosture,
  position: Point,
  feet: number,
  heading: number
): PostureTarget {
  return posture === "sitting"
    ? seatTarget(world, position, feet, heading)
    : lieTarget(world, position, feet, heading)
}
