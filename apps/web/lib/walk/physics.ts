import {
  add,
  directionOf,
  dot,
  type Point,
  scale,
  sub,
} from "@roomer/core/geometry"

import {
  circleInsidePenetration,
  circlePolygonPenetration,
  type Penetration,
} from "./collide"
import {
  BUMP_SPEED,
  CONTACT_SLOP,
  HEAD_BOB,
  JUMP_SPEED,
  MAX_FRAME,
  PLAYER,
  SUBSTEP,
} from "./player"
import {
  blocks,
  groundAt,
  isFree,
  nearBox,
  nearestFree,
  type WalkWorld,
} from "./world"

// First-person walking as a pure, fixed-step simulation: the same inputs
// always give the same path. Each 1/120 s step moves the body circle on the
// plan, pushes it out of anything at body height (sliding along it), then
// handles gravity, landing on whatever is underfoot and head bumps.

export interface WalkInput {
  /** Forward (+1) / back (−1). */
  forward: number
  /** Right (+1) / left (−1). */
  strafe: number
  run: boolean
  /** Jumps on the step it becomes true while standing. */
  jump: boolean
  /** Plan bearing the walker faces, degrees. */
  heading: number
}

export type BumpKind = "placement" | "feature" | "wall" | "ceiling"

export interface WalkBump {
  /** Placement id, feature id, "wall" or "ceiling". */
  bumped: string
  kind: BumpKind
  /** "Test three-seat sofa", "Wall pier", "the wall W6", "the ceiling". */
  label: string
  /** Simulation time of the bump, seconds. */
  at: number
}

export interface WalkState {
  /** Plan position of the body's centre, mm. */
  position: Point
  /** Height of the feet above the floor, mm. */
  feet: number
  /** Plan velocity, mm/s. */
  velocity: Point
  /** Vertical velocity, mm/s (up +). */
  vy: number
  heading: number
  grounded: boolean
  /** Simulated time, s. */
  time: number
  /** Distance walked on the ground, mm (drives head-bob). */
  walked: number
  /** Time not yet simulated (less than one step), s. */
  carry: number
  /** The most recent bump. */
  bump: WalkBump | null
  /** Jump was held last step (a held key doesn't bounce). */
  jumpHeld: boolean
}

export const IDLE: Omit<WalkInput, "heading"> = {
  forward: 0,
  strafe: 0,
  run: false,
  jump: false,
}

/** Standing still at a position (default: the world's spawn). */
export function createWalkState(
  world: WalkWorld,
  at: { position: Point; heading: number } = world.spawn
): WalkState {
  return {
    position: at.position,
    feet: groundAt(world, at.position, PLAYER.stepUp),
    velocity: [0, 0],
    vy: 0,
    heading: at.heading,
    grounded: true,
    time: 0,
    walked: 0,
    carry: 0,
    bump: null,
    jumpHeld: false,
  }
}

interface Contact {
  bump: Omit<WalkBump, "at">
  speed: number
}

/** Every overlap at `position` for feet at `feet`: the room, then colliders. */
function penetrations(
  world: WalkWorld,
  position: Point,
  feet: number
): { pen: Penetration; bump: Omit<WalkBump, "at"> }[] {
  const out: { pen: Penetration; bump: Omit<WalkBump, "at"> }[] = []
  const wall = circleInsidePenetration(
    position,
    PLAYER.radius + world.wallInset,
    world.outline
  )
  if (wall) {
    out.push({
      pen: wall,
      bump: {
        bumped: "wall",
        kind: "wall",
        label: world.wallLabels[wall.edge] ?? "the wall",
      },
    })
  }
  for (const c of world.colliders) {
    if (!blocks(c, feet, world.player.height)) continue
    if (!nearBox(c.box, position, PLAYER.radius)) continue
    const pen = circlePolygonPenetration(position, PLAYER.radius, c.footprint)
    if (pen) {
      out.push({ pen, bump: { bumped: c.id, kind: c.kind, label: c.label } })
    }
  }
  return out
}

function deepest(world: WalkWorld, position: Point, feet: number): number {
  return Math.max(
    0,
    ...penetrations(world, position, feet).map((p) => p.pen.depth)
  )
}

/**
 * Pushes the body out of everything it overlaps, a few passes so corners
 * settle, and strips the velocity heading into each surface (sliding).
 */
function resolve(
  world: WalkWorld,
  start: Point,
  proposed: Point,
  velocity: Point,
  feet: number
): { position: Point; velocity: Point; contact: Contact | null } {
  let position = proposed
  let v = velocity
  let contact: Contact | null = null
  for (let pass = 0; pass < 4; pass++) {
    let pushed = false
    // Re-measure after every push so one push can't undo another.
    for (let guard = 0; guard < 16; guard++) {
      const [hit] = penetrations(world, position, feet)
      if (!hit || hit.pen.depth < 1e-6) break
      pushed = true
      position = add(position, scale(hit.pen.normal, hit.pen.depth + 1e-6))
      const into = dot(v, hit.pen.normal)
      if (into < 0) {
        if (-into > BUMP_SPEED && (!contact || -into > contact.speed)) {
          contact = { bump: hit.bump, speed: -into }
        }
        v = sub(v, scale(hit.pen.normal, into))
      }
    }
    if (!pushed) break
  }
  // Wedged with no way out (a gap narrower than the body): stay put rather
  // than squeeze through.
  if (
    deepest(world, position, feet) > CONTACT_SLOP &&
    deepest(world, start, feet) <= CONTACT_SLOP
  ) {
    return { position: start, velocity: [0, 0], contact }
  }
  return { position, velocity: v, contact }
}

/** Lowest thing above the head the body is under (or the ceiling), mm. */
function overhead(
  world: WalkWorld,
  position: Point,
  head: number
): { height: number; bump: Omit<WalkBump, "at"> } {
  let best = {
    height: world.ceilingHeight,
    bump: { bumped: "ceiling", kind: "ceiling", label: "the ceiling" } as Omit<
      WalkBump,
      "at"
    >,
  }
  for (const c of world.colliders) {
    if (c.walkable || c.y0 < head - 1 || c.y0 >= best.height) continue
    if (!nearBox(c.box, position, PLAYER.radius)) continue
    if (circlePolygonPenetration(position, PLAYER.radius, c.footprint)) {
      best = {
        height: c.y0,
        bump: { bumped: c.id, kind: c.kind, label: c.label },
      }
    }
  }
  return best
}

/** One fixed step (SUBSTEP seconds). */
export function stepWalk(
  world: WalkWorld,
  state: WalkState,
  input: WalkInput
): WalkState {
  const h = SUBSTEP
  const time = state.time + h

  // Horizontal: velocity eases towards what the keys ask for.
  const forward = directionOf(input.heading)
  const right = directionOf(input.heading + 90)
  let wish = add(scale(forward, input.forward), scale(right, input.strafe))
  const wishLength = Math.hypot(wish[0], wish[1])
  if (wishLength > 1) wish = scale(wish, 1 / wishLength)
  const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed
  const response = state.grounded ? PLAYER.groundResponse : PLAYER.airResponse
  const k = 1 - Math.exp(-response * h)
  const desired = scale(wish, speed)
  const velocity = add(state.velocity, scale(sub(desired, state.velocity), k))
  const moved = resolve(
    world,
    state.position,
    add(state.position, scale(velocity, h)),
    velocity,
    state.feet
  )
  let bump = state.bump
  const record = (b: Omit<WalkBump, "at">) => {
    if (!bump || bump.bumped !== b.bumped || time - bump.at > 0.5) {
      bump = { ...b, at: time }
    }
  }
  if (moved.contact) record(moved.contact.bump)

  // Vertical: jump on press, gravity, land on what's underfoot.
  let vy = state.vy
  if (input.jump && !state.jumpHeld && state.grounded) vy = JUMP_SPEED
  vy -= PLAYER.gravity * h
  let feet = state.feet + vy * h
  const ground = groundAt(world, moved.position, Math.max(feet, state.feet))
  let grounded = false
  if (feet <= ground) {
    // Landing, or rising past a ledge within a step of the feet: either
    // way, stand on it (no extra boost from the step-up).
    feet = ground
    vy = 0
    grounded = true
  }
  const { height } = world.player
  const above = overhead(world, moved.position, state.feet + height)
  if (feet + height > above.height) {
    feet = Math.max(ground, above.height - height)
    if (vy > 0) {
      if (vy > BUMP_SPEED) record(above.bump)
      vy = 0
    }
  }

  const step = Math.hypot(
    moved.position[0] - state.position[0],
    moved.position[1] - state.position[1]
  )
  return {
    position: moved.position,
    feet,
    velocity: moved.velocity,
    vy,
    heading: input.heading,
    grounded,
    time,
    walked: state.walked + (grounded ? step : 0),
    carry: state.carry,
    bump,
    jumpHeld: input.jump,
  }
}

/**
 * Advances by a frame of `dt` seconds in fixed steps, carrying the
 * remainder to the next frame. Frames longer than MAX_FRAME are clipped.
 */
export function advanceWalk(
  world: WalkWorld,
  state: WalkState,
  input: WalkInput,
  dt: number
): WalkState {
  let total = state.carry + Math.min(Math.max(dt, 0), MAX_FRAME)
  let next = state
  while (total >= SUBSTEP - 1e-12) {
    next = stepWalk(world, next, input)
    total -= SUBSTEP
  }
  return { ...next, carry: Math.max(0, total) }
}

/** Puts the walker somewhere (feet on whatever is underfoot), at rest. */
export function teleport(
  world: WalkWorld,
  state: WalkState,
  position: Point,
  heading = state.heading,
  feet?: number
): WalkState {
  return {
    ...state,
    position,
    heading,
    feet: feet ?? groundAt(world, position, PLAYER.stepUp),
    velocity: [0, 0],
    vy: 0,
    grounded: feet === undefined,
    carry: 0,
  }
}

/** Eye height above the floor (mm) including a gentle head-bob. */
export function eyeHeight(world: WalkWorld, state: WalkState): number {
  return state.feet + world.player.eyeHeight + headBob(state)
}

/**
 * Carries a walker into a rebuilt world (new stature, moved furniture):
 * same spot and heading, feet re-grounded on whatever is now underfoot,
 * and nudged to the nearest free spot if something now stands there.
 */
export function reseat(world: WalkWorld, state: WalkState): WalkState {
  const feet = groundAt(world, state.position, state.feet)
  const position = isFree(world, state.position, feet)
    ? state.position
    : nearestFree(world, state.position)
  return {
    ...state,
    position,
    feet: position === state.position ? feet : groundAt(world, position, 0),
    velocity: [0, 0],
    vy: 0,
    grounded: true,
    carry: 0,
  }
}

/** Head-bob offset (mm): a stride-paced bob that fades as you stop. */
export function headBob(state: WalkState): number {
  if (!state.grounded) return 0
  const speed = Math.hypot(state.velocity[0], state.velocity[1])
  const fade = Math.min(1, speed / PLAYER.walkSpeed)
  return (
    Math.sin((state.walked / HEAD_BOB.stride) * 2 * Math.PI) *
    HEAD_BOB.amplitude *
    fade
  )
}
