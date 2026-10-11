import { describe, expect, it } from "vitest"

import { slugify, uniqueId } from "../../src/placement"
import { zSlug } from "../../src/schema"

describe("slugify", () => {
  it("lowercases, strips accents and joins words with single hyphens", () => {
    expect(slugify("Söderhamn 3-seat Sofa!")).toBe("soderhamn-3-seat-sofa")
    expect(slugify("  Harper   Dining__Table ")).toBe("harper-dining-table")
  })

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("item")
    expect(slugify("", "chair")).toBe("chair")
  })

  it("caps the length at a word boundary", () => {
    const slug = slugify(
      "Castlery Auburn Chaise Sofa Left Facing in Chalk Boucle with Walnut Legs"
    )
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith("-")).toBe(false)
    expect(slug).toBe(
      "castlery-auburn-chaise-sofa-left-facing-in-chalk-boucle-with"
    )
  })

  it("always produces a valid slug", () => {
    for (const text of ["Ünïcödé", "a--b", "-x-", "123", "Lamp (tall) #2"]) {
      expect(zSlug.safeParse(slugify(text)).success).toBe(true)
    }
  })
})

describe("uniqueId", () => {
  it("returns the base when it's free, else the next numbered one", () => {
    expect(uniqueId("sofa", new Set())).toBe("sofa")
    expect(uniqueId("chair", new Set(["chair"]))).toBe("chair-2")
    expect(uniqueId("chair", new Set(["chair", "chair-2", "chair-3"]))).toBe(
      "chair-4"
    )
  })
})
