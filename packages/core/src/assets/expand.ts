import type { Part } from "../schema"

// `repeat` is shorthand: a part with `repeat: { count, step }` stands for
// `count` copies in a row. Every consumer (bounds, validation, collision,
// world shapes, the plan, the 3D scene and walk physics) works on the
// expanded list from `expandParts`, so nothing ever sees the shorthand.
// validateAsset caps the expanded total at MAX_EXPANDED_PARTS (schema).

/** The part without its `repeat` (what a single copy is). */
function single(part: Part): Part {
  const copy = { ...part }
  delete copy.repeat
  return copy
}

/** Copy i of a repeated part (0-based): shifted by i × step, named "#i+1". */
function copyAt(part: Part, index: number): Part {
  const step = part.repeat?.step ?? [0, 0, 0]
  const [x, y, z] = part.position
  return {
    ...single(part),
    name: `${part.name} #${index + 1}`,
    position: [x + index * step[0], y + index * step[1], z + index * step[2]],
  }
}

/** One part's copies: itself when it doesn't repeat. */
export function partCopies(part: Part): Part[] {
  if (!part.repeat) return [part]
  return Array.from({ length: part.repeat.count }, (_, i) => copyAt(part, i))
}

/** Every part with its repeats written out, in order. */
export function expandParts(parts: readonly Part[]): Part[] {
  return parts.flatMap(partCopies)
}

/** How many parts `expandParts` would return, without building them. */
export function expandedPartCount(parts: readonly Part[]): number {
  return parts.reduce((sum, part) => sum + (part.repeat?.count ?? 1), 0)
}
