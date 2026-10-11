import type { WalkInput } from "./physics"

// Keyboard → walk input. Keys are `KeyboardEvent.code`s, so WASD sits
// under the same fingers on any layout.

export const WALK_KEYS = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  run: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
  turnLeft: ["KeyQ"],
  turnRight: ["KeyE"],
} as const

/** Degrees per second for Q/E turning (no mouse needed). */
export const TURN_SPEED = 120

const ALL_CODES: ReadonlySet<string> = new Set(Object.values(WALK_KEYS).flat())

/** Is this a key the walk view handles (so the page shouldn't scroll)? */
export function isWalkKey(code: string): boolean {
  return ALL_CODES.has(code)
}

const held = (keys: ReadonlySet<string>, codes: readonly string[]) =>
  codes.some((code) => keys.has(code))

export function inputFromKeys(
  keys: ReadonlySet<string>,
  heading: number
): WalkInput {
  const axis = (plus: readonly string[], minus: readonly string[]) =>
    (held(keys, plus) ? 1 : 0) - (held(keys, minus) ? 1 : 0)
  return {
    forward: axis(WALK_KEYS.forward, WALK_KEYS.back),
    strafe: axis(WALK_KEYS.right, WALK_KEYS.left),
    run: held(keys, WALK_KEYS.run),
    jump: held(keys, WALK_KEYS.jump),
    heading,
  }
}

/** Q/E turning for this frame, degrees (clockwise on the plan = right). */
export function turnFromKeys(keys: ReadonlySet<string>, dt: number): number {
  const direction =
    (held(keys, WALK_KEYS.turnRight) ? 1 : 0) -
    (held(keys, WALK_KEYS.turnLeft) ? 1 : 0)
  return direction * TURN_SPEED * dt
}
