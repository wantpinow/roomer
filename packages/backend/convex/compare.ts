/**
 * Structural comparison for documents read back from Convex, whose object
 * keys don't come back in the order they were written.
 */

/** JSON with object keys sorted (and undefined fields dropped). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1))
        )
      : inner
  )
}

/** Deep equality that ignores object key order. */
export function sameValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b)
}
