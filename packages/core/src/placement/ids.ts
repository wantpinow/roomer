// Readable slugs for placement and camera ids (architecture §3.2).

const MAX_SLUG_LENGTH = 60

/**
 * "Söderhamn 3-seat Sofa!" → "soderhamn-3-seat-sofa". Never empty (falls
 * back to `fallback`) and at most 60 characters, cut at a hyphen.
 */
export function slugify(text: string, fallback = "item"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (slug.length === 0) return fallback
  if (slug.length <= MAX_SLUG_LENGTH) return slug
  const cut = slug.slice(0, MAX_SLUG_LENGTH)
  if (slug[MAX_SLUG_LENGTH] === "-") return cut
  const lastHyphen = cut.lastIndexOf("-")
  return lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut
}

/** `base`, or `base-2`, `base-3`, … — the first one not in `taken`. */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}
