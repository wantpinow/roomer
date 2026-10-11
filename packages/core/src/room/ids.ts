import { FEATURE_ID_PREFIX, type FeatureType } from "../schema"

// Readable feature ids (architecture §3.2): a per-type prefix plus a number,
// D1, D2, WIN1, RAD1, L1 … Numbers are never reused within a room while a
// higher one exists, so "D3" keeps meaning the same door in the agent's
// history even after D2 is removed.

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The next free id for a feature of `type`: the prefix followed by one more
 * than the highest number already used with that prefix. Types sharing a
 * prefix (pendant and ceiling-light are both `L`) share the sequence.
 */
export function assignFeatureId(
  type: FeatureType,
  existing: Iterable<string>
): string {
  const prefix = FEATURE_ID_PREFIX[type]
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`)
  let highest = 0
  for (const id of existing) {
    const match = pattern.exec(id)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `${prefix}${highest + 1}`
}

/** Fill in missing feature ids, in order, without clashing with any given. */
export function withFeatureIds<T extends { type: FeatureType; id?: string }>(
  features: readonly T[]
): (T & { id: string })[] {
  const taken = new Set(
    features.flatMap((feature) => (feature.id ? [feature.id] : []))
  )
  return features.map((feature) => {
    if (feature.id) return { ...feature, id: feature.id }
    const id = assignFeatureId(feature.type, taken)
    taken.add(id)
    return { ...feature, id }
  })
}
