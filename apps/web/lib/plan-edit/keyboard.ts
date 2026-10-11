import type { LayoutOp } from "@roomer/core/schema"

// Keyboard editing of the selected placement in the plan:
//   arrows      nudge 10mm (Shift: 100mm), up = up the page (−z)
//   R / ⇧R      turn 15° clockwise / anticlockwise
//   Delete, ⌫   remove
//   Esc         deselect

export const NUDGE_MM = 10
export const NUDGE_LARGE_MM = 100
export const ROTATE_STEP_DEG = 15

export interface KeyInput {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

export type PlanKeyAction =
  | { kind: "op"; op: Extract<LayoutOp, { op: "nudge" }> }
  | { kind: "remove" }
  | { kind: "deselect" }

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** What a key press does to the selected placement, or null if nothing. */
export function planKeyAction(
  event: KeyInput,
  placementId: string
): PlanKeyAction | null {
  // Leave browser and OS shortcuts (⌘←, Ctrl+R, Alt+…) alone.
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  const arrow = ARROWS[event.key]
  if (arrow) {
    const step = event.shiftKey ? NUDGE_LARGE_MM : NUDGE_MM
    const [sx, sz] = arrow
    return {
      kind: "op",
      op: {
        op: "nudge",
        id: placementId,
        ...(sx !== 0 ? { dx: sx * step } : {}),
        ...(sz !== 0 ? { dz: sz * step } : {}),
      },
    }
  }
  if (event.key === "r" || event.key === "R") {
    return {
      kind: "op",
      op: {
        op: "nudge",
        id: placementId,
        rotate: event.shiftKey ? -ROTATE_STEP_DEG : ROTATE_STEP_DEG,
      },
    }
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    return { kind: "remove" }
  }
  if (event.key === "Escape") return { kind: "deselect" }
  return null
}
