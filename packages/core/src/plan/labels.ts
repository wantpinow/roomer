import type { Point } from "../geometry/angles"
import type { Bounds2 } from "../geometry/polygon"
import { boundsOverlap } from "../lint/polygons"

// Fitting item names inside their footprints: try the full name on one or
// two lines, along either of the item's axes, shrinking down to a minimum
// size; then shorter versions ("Söderhamn 3-seat sofa" → "3-seat sofa" →
// "sofa"); then an ellipsis. Widths are estimated from character counts —
// good enough for a proportional sans at these sizes.

/** Average advance of a character, as a fraction of the font size. */
export const CHAR_WIDTH_EM = 0.56
const LINE_HEIGHT_EM = 1.15

export interface LabelFit {
  lines: string[]
  size: number
  /** True when set along the item's second axis rather than its first. */
  alongSecond: boolean
  /** Too thin for any label inside (a wall-hung TV): set beside it. */
  outside?: boolean
}

export interface LabelBox {
  /** Room along the item's first axis (its width), mm. */
  first: number
  /** Room along its second axis (its depth), mm. */
  second: number
  /** Whether the first axis is the more horizontal one on the plan. */
  firstIsHorizontal: boolean
}

export function textWidth(line: string, size: number): number {
  return line.length * CHAR_WIDTH_EM * size
}

/** Split words into two lines as evenly as possible. */
export function twoLines(words: readonly string[]): string[] | undefined {
  if (words.length < 2) return undefined
  let best: string[] | undefined
  let bestLongest = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ")
    const b = words.slice(i).join(" ")
    const longest = Math.max(a.length, b.length)
    if (longest < bestLongest) {
      bestLongest = longest
      best = [a, b]
    }
  }
  return best
}

/** Shorter versions of a name: drop leading words one at a time. */
export function shorterNames(name: string): string[] {
  const words = name.trim().split(/\s+/)
  const names: string[] = []
  for (let i = 1; i < words.length; i++) names.push(words.slice(i).join(" "))
  return names
}

function fitSize(lines: readonly string[], along: number, across: number) {
  const longest = Math.max(...lines.map((l) => l.length), 1)
  return Math.min(
    along / (longest * CHAR_WIDTH_EM),
    across / (lines.length * LINE_HEIGHT_EM)
  )
}

/** Best layout of one text in the box, or undefined if it can't reach `min`. */
function bestLayout(
  name: string,
  box: LabelBox,
  max: number,
  min: number
): LabelFit | undefined {
  const words = name.split(/\s+/)
  const layouts = [[name], twoLines(words)].filter(
    (l): l is string[] => l !== undefined
  )
  let best: LabelFit | undefined
  let bestScore = 0
  for (const lines of layouts) {
    for (const alongSecond of [false, true]) {
      const along = alongSecond ? box.second : box.first
      const across = alongSecond ? box.first : box.second
      const size = Math.min(max, fitSize(lines, along, across))
      if (size < min) continue
      // Prefer horizontal text and single lines unless clearly smaller.
      const horizontal = alongSecond !== box.firstIsHorizontal
      const score =
        size * (horizontal ? 1.2 : 1) * (lines.length === 1 ? 1.1 : 1)
      if (score > bestScore) {
        bestScore = score
        best = { lines, size: Math.floor(size), alongSecond }
      }
    }
  }
  return best
}

export function fitLabel(
  name: string,
  box: LabelBox,
  max: number,
  min: number
): LabelFit | undefined {
  for (const candidate of [name, ...shorterNames(name)]) {
    const fit = bestLayout(candidate, box, max, min)
    if (fit) return fit
  }
  // Too small for its own name inside: if it's too thin for even a short
  // label, set the name beside it, along its longer side.
  const alongSecond = box.second > box.first
  const along = alongSecond ? box.second : box.first
  const across = alongSecond ? box.first : box.second
  if (across < min * LINE_HEIGHT_EM) {
    const size = Math.max(
      min,
      Math.min(max, along / (Math.max(name.length, 1) * CHAR_WIDTH_EM))
    )
    return { lines: [name], size: Math.floor(size), alongSecond, outside: true }
  }
  // Otherwise the last word, cut with an ellipsis, at the minimum size.
  const last = name.trim().split(/\s+/).pop() ?? name
  const chars = Math.floor(along / (CHAR_WIDTH_EM * min)) - 1
  if (chars < 2) return undefined
  return { lines: [`${last.slice(0, chars)}…`], size: min, alongSecond }
}

/** Plan-space bounding box of a label of `fit` centred at `at`. */
export function labelBounds(
  fit: LabelFit,
  at: Point,
  direction: Point
): Bounds2 {
  const width = Math.max(...fit.lines.map((l) => textWidth(l, fit.size)))
  const height = fit.lines.length * LINE_HEIGHT_EM * fit.size
  const [dx, dz] = direction
  const halfX = (Math.abs(dx) * width + Math.abs(dz) * height) / 2
  const halfZ = (Math.abs(dz) * width + Math.abs(dx) * height) / 2
  return {
    minX: at[0] - halfX,
    maxX: at[0] + halfX,
    minZ: at[1] - halfZ,
    maxZ: at[1] + halfZ,
  }
}

/** Keeps placed label boxes so later labels can avoid them. */
export class LabelSpace {
  private readonly boxes: Bounds2[] = []

  isFree(box: Bounds2, avoid: readonly Bounds2[] = []): boolean {
    return (
      !this.boxes.some((b) => boundsOverlap(b, box)) &&
      !avoid.some((b) => boundsOverlap(b, box))
    )
  }

  add(box: Bounds2): void {
    this.boxes.push(box)
  }
}

export { LINE_HEIGHT_EM }
