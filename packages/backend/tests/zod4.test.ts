/**
 * Roomer's validation strategy (architecture §2) derives Convex validators
 * from the zod 4 schemas in @roomer/core with `convex-helpers/server/zod4`.
 * This pins that the bridge exists at the installed versions and produces the
 * validator shapes (and types) we rely on.
 */
import { zodToConvex } from "convex-helpers/server/zod4"
import type { Infer } from "convex/values"
import { describe, expect, expectTypeOf, it } from "vitest"
import { z } from "zod"

const zExample = z.object({
  name: z.string().describe("Human-readable name"),
  widthMm: z.number().int().positive(),
  mount: z.enum(["floor", "wall", "ceiling"]),
  notes: z.string().optional(),
  corners: z.array(z.tuple([z.number(), z.number()])),
})

describe("zodToConvex (convex-helpers/server/zod4)", () => {
  const vExample = zodToConvex(zExample)

  it("converts a zod object into a Convex object validator", () => {
    expect(vExample.kind).toBe("object")
    expect(vExample.isOptional).toBe("required")
  })

  it("maps each field to the matching Convex validator kind", () => {
    const { fields } = vExample
    expect(fields.name.kind).toBe("string")
    expect(fields.widthMm.kind).toBe("float64")
    expect(fields.mount.kind).toBe("union")
    expect(fields.notes.kind).toBe("string")
    expect(fields.notes.isOptional).toBe("optional")
    expect(fields.corners.kind).toBe("array")
  })

  it("keeps the inferred types compatible with zod's", () => {
    expectTypeOf<Infer<typeof vExample>>().toEqualTypeOf<
      z.infer<typeof zExample>
    >()
  })
})
