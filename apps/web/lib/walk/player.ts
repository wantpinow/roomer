// The walker: an adult as an upright cylinder. How tall is a setting (see
// stature.ts, stored on the world as `world.player`); everything else about
// the body lives here. Distances are millimetres and times seconds
// throughout lib/walk, like the rest of the domain; the viewer converts to
// metres at the edge.

export const PLAYER = {
  /** Body radius, mm: shoulders are about 500 mm across. */
  radius: 250,
  /** Highest ledge walked onto without jumping, mm (a rug, a low step). */
  stepUp: 180,
  /** mm/s */
  walkSpeed: 1400,
  /** mm/s, with Shift */
  runSpeed: 3000,
  /** Jump apex above the take-off surface, mm. */
  jumpHeight: 500,
  /** mm/s² */
  gravity: 9810,
  /** How quickly velocity follows input on the ground (1/s)… */
  groundResponse: 14,
  /** …and in the air (1/s): reduced air control. */
  airResponse: 2.5,
} as const

/** Launch speed that peaks at `jumpHeight`: v0 = √(2·g·h), mm/s. */
export const JUMP_SPEED = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight)

/** Fixed physics step, seconds. */
export const SUBSTEP = 1 / 120

/** Longest frame the simulation catches up on (a stalled tab doesn't explode). */
export const MAX_FRAME = 0.1

/** Overlap (mm) tolerated after resolving contacts; wedges settle within it. */
export const CONTACT_SLOP = 1

/** Moving into something faster than this (mm/s) counts as a bump. */
export const BUMP_SPEED = 250

/** Head-bob: one bob per stride of this length (mm), this tall (mm). */
export const HEAD_BOB = { stride: 700, amplitude: 14 } as const
