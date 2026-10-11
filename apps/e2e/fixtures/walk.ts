/**
 * Driving walk mode through `window.__roomerWalk`, the dev-only debug handle
 * the walk controller installs (apps/web/components/scene/walk-controller.tsx;
 * `pnpm e2e` runs `next dev`, so it is there).
 *
 * The handle steps the walk physics synchronously, so a whole manoeuvre runs
 * inside one `page.evaluate` — no animation frames can interleave with it,
 * which keeps every path deterministic.
 */
import { expect, type Page } from "@playwright/test"

/** What a spec reads back from the walker (the handle's own shapes). */
export interface WalkerPosition {
  x: number
  z: number
  /** Feet above the floor, mm. */
  feet: number
  /** Eye height above the floor, mm. */
  eye: number
  heading: number
  grounded: boolean
}

export interface WalkBump {
  bumped: string
  kind: "placement" | "feature" | "wall" | "ceiling"
  label: string
  at: number
}

export interface WalkInput {
  forward?: number
  strafe?: number
  run?: boolean
  jump?: boolean
  heading?: number
}

/** One leg of a manoeuvre: hold `input` for `seconds`. */
export interface WalkLeg {
  input: WalkInput
  seconds: number
}

interface WalkCollider {
  id: string
  kind: string
  y0: number
  y1: number
}

/** The view itself, whatever the posture (walk-controller.tsx's WalkPose). */
export interface WalkerPose {
  posture: "standing" | "sitting" | "lying"
  label: string
  /** Eye position [x, y, z], mm. */
  eye: [number, number, number]
  heading: number
  pitch: number
}

interface WalkDebugHandle {
  world: { colliders: WalkCollider[]; spawn: { position: [number, number] } }
  state(): { bump: WalkBump | null }
  position(): WalkerPosition
  pose(): WalkerPose
  teleport(
    x: number,
    z: number,
    options?: { heading?: number; feet?: number }
  ): void
  step(input: WalkInput, seconds: number): unknown
}

declare global {
  interface Window {
    __roomerWalk?: WalkDebugHandle
  }
}

/** Wait for the walk controller to install its handle. */
export async function waitForWalker(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__roomerWalk !== undefined)
}

export interface WalkResult {
  /** Where the walker ended up. */
  end: WalkerPosition
  /** The walker after each leg. */
  legs: WalkerPosition[]
  /** Highest feet reached at any 1/60 s sample, mm. */
  peakFeet: number
  /** Every distinct bump during the walk, in order. */
  bumps: WalkBump[]
}

/**
 * Teleport to `from` (plan mm) facing `heading`, then run the legs, sampling
 * every 1/60 s. Runs synchronously in the page.
 */
export async function walk(
  page: Page,
  from: { x: number; z: number; heading: number },
  legs: WalkLeg[]
): Promise<WalkResult> {
  return await page.evaluate(
    ({ from, legs }) => {
      const walker = window.__roomerWalk
      if (!walker) throw new Error("window.__roomerWalk is not installed")
      walker.teleport(from.x, from.z, { heading: from.heading })
      // Bumps from before this walk don't count.
      const earlier = walker.state().bump
      const bumps: WalkBump[] = []
      const ends: WalkerPosition[] = []
      let peakFeet = walker.position().feet
      const frame = 1 / 60
      for (const leg of legs) {
        for (let t = 0; t < leg.seconds - 1e-9; t += frame) {
          walker.step(leg.input, frame)
          const at = walker.position()
          peakFeet = Math.max(peakFeet, at.feet)
          const bump = walker.state().bump
          // A new bump is a new object; a remembered one is the same object.
          if (bump && bump !== earlier && bumps.at(-1) !== bump) {
            bumps.push(bump)
          }
        }
        ends.push(walker.position())
      }
      return { end: walker.position(), legs: ends, peakFeet, bumps }
    },
    { from, legs }
  )
}

/** The walk world's collider for a placement or feature id. */
export async function collider(
  page: Page,
  id: string
): Promise<WalkCollider | undefined> {
  return await page.evaluate(
    (id) => window.__roomerWalk?.world.colliders.find((c) => c.id === id),
    id
  )
}

/** Expect a number within `tolerance` of `expected`. */
export function expectNear(
  actual: number,
  expected: number,
  tolerance: number,
  what: string
): void {
  expect(
    Math.abs(actual - expected),
    `${what}: ${actual} is not within ${tolerance} of ${expected}`
  ).toBeLessThanOrEqual(tolerance)
}
