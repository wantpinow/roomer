// Keyboard editing of the selection on the plan:
//   arrows      nudge 10mm (Shift: 100mm), up = up the page (−z)
//   R / ⇧R      one item: turn 15° clockwise / anticlockwise;
//               a group: turn 90° / 15° clockwise about its centre
//   Delete, ⌫   remove
//   Esc         clear the selection
//   ⌘A / Ctrl+A select every item

export const NUDGE_MM = 10
export const NUDGE_LARGE_MM = 100
export const ROTATE_STEP_DEG = 15
export const GROUP_ROTATE_STEP_DEG = 90

export interface KeyInput {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

export type PlanKeyAction =
  | { kind: "nudge"; dx: number; dz: number }
  | { kind: "rotate"; degrees: number }
  | { kind: "remove" }
  | { kind: "deselect" }
  | { kind: "selectAll" }

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/**
 * What a key press does, given how many items are selected; null when it
 * does nothing (so the browser keeps it).
 */
export function planKeyAction(
  event: KeyInput,
  selected: number
): PlanKeyAction | null {
  if ((event.metaKey || event.ctrlKey) && !event.altKey) {
    return event.key === "a" || event.key === "A" ? { kind: "selectAll" } : null
  }
  // Leave other browser and OS shortcuts (Alt+…) alone.
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  if (event.key === "Escape") return selected > 0 ? { kind: "deselect" } : null
  if (selected === 0) return null
  const arrow = ARROWS[event.key]
  if (arrow) {
    const step = event.shiftKey ? NUDGE_LARGE_MM : NUDGE_MM
    return { kind: "nudge", dx: arrow[0] * step, dz: arrow[1] * step }
  }
  if (event.key === "r" || event.key === "R") {
    const degrees =
      selected > 1
        ? event.shiftKey
          ? ROTATE_STEP_DEG
          : GROUP_ROTATE_STEP_DEG
        : event.shiftKey
          ? -ROTATE_STEP_DEG
          : ROTATE_STEP_DEG
    return { kind: "rotate", degrees }
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    return { kind: "remove" }
  }
  return null
}
