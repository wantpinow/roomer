import { zMm, zPositiveMm } from "@roomer/core/schema"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { compactJsonSchema, forMcp } from "../json-schema"

describe("compactJsonSchema", () => {
  it("drops bounds, generic unit text, enum types, string limits and $schema", () => {
    const schema = z.object({
      width: zPositiveMm,
      offset: zMm.min(0).describe("Distance along the wall"),
      kind: z.enum(["a", "b"]),
      name: z.string().min(1).max(80),
      tags: z.array(z.string()).min(1).max(20),
      pair: z.array(z.string()).min(2).max(3),
    })
    const json = compactJsonSchema(
      z.toJSONSchema(schema, { target: "draft-2020-12" })
    )
    expect(json).not.toHaveProperty("$schema")
    expect(json.properties).toEqual({
      width: { type: "integer", exclusiveMinimum: 0 },
      offset: {
        type: "integer",
        minimum: 0,
        description: "Distance along the wall",
      },
      kind: { enum: ["a", "b"] },
      name: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      pair: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 3,
      },
    })
  })

  it("writes a uniform tuple as items, and keeps mixed ones", () => {
    const json = compactJsonSchema(
      z.toJSONSchema(
        z.object({
          xyz: z.tuple([zMm, zMm, zMm]),
          mixed: z.tuple([z.string(), zMm]),
        }),
        { target: "draft-2020-12" }
      )
    )
    expect(json.properties).toEqual({
      xyz: {
        type: "array",
        items: { type: "integer" },
        minItems: 3,
        maxItems: 3,
      },
      mixed: {
        type: "array",
        prefixItems: [{ type: "string" }, { type: "integer" }],
        items: false,
        minItems: 2,
        maxItems: 2,
      },
    })
  })

  it("never mistakes a property name for a keyword", () => {
    const json = compactJsonSchema(
      z.toJSONSchema(
        z.object({
          maxLength: z.number(),
          type: z.string(),
          enum: z.boolean(),
          description: z.string().describe("A field named description"),
        }),
        { target: "draft-2020-12" }
      )
    )
    expect(Object.keys(json.properties as object)).toEqual([
      "maxLength",
      "type",
      "enum",
      "description",
    ])
  })
})

describe("forMcp", () => {
  it("lists the compact JSON Schema", () => {
    const schema = forMcp(z.object({ n: zPositiveMm }))
    expect(
      schema["~standard"].jsonSchema.input({ target: "draft-2020-12" })
    ).toEqual({
      type: "object",
      properties: { n: { type: "integer", exclusiveMinimum: 0 } },
      required: ["n"],
    })
  })

  it("leaves validation to the tool, so the SDK passes anything through", async () => {
    const schema = forMcp(z.object({ n: zPositiveMm }))
    expect(await schema["~standard"].validate({ n: "nope" })).toEqual({
      value: { n: "nope" },
    })
  })
})
