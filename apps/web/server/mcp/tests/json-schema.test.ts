import { zMm, zPositiveMm } from "@roomer/core/schema"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { compactJsonSchema, forMcp } from "../json-schema"

describe("compactJsonSchema", () => {
  it("drops safe-integer bounds and generic mm descriptions, nothing else", () => {
    const schema = z.object({
      width: zPositiveMm,
      offset: zMm.min(0).describe("Distance along the wall"),
      tuple: z.tuple([zMm, zMm]),
      description: z.string().describe("A field named description"),
    })
    const json = compactJsonSchema(
      z.toJSONSchema(schema, { target: "draft-2020-12" })
    )
    expect(json.properties).toEqual({
      width: { type: "integer", exclusiveMinimum: 0 },
      offset: {
        type: "integer",
        minimum: 0,
        description: "Distance along the wall",
      },
      tuple: {
        type: "array",
        prefixItems: [{ type: "integer" }, { type: "integer" }],
        items: false,
        minItems: 2,
        maxItems: 2,
      },
      description: { type: "string", description: "A field named description" },
    })
  })
})

describe("forMcp", () => {
  it("validates exactly like the zod schema", async () => {
    const schema = forMcp(z.object({ n: zPositiveMm }))
    const ok = await schema["~standard"].validate({ n: 5 })
    expect(ok).toEqual({ value: { n: 5 } })
    const bad = await schema["~standard"].validate({ n: 0.5 })
    expect("issues" in bad && bad.issues?.length).toBeTruthy()
  })

  it("lists a compact JSON Schema", () => {
    const schema = forMcp(z.object({ n: zPositiveMm }))
    expect(
      schema["~standard"].jsonSchema.input({ target: "draft-2020-12" })
    ).toMatchObject({
      properties: { n: { type: "integer", exclusiveMinimum: 0 } },
    })
  })
})
