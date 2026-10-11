import { describe, expect, it } from "vitest"
import { z } from "zod"

import { discriminatorValues, looseUnion, unionReference } from "../compact"

const zThing = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("door"),
    id: z.string().optional(),
    wall: z.string(),
    offset: z.number(),
    hinge: z.enum(["start", "end"]),
    leaves: z.union([z.literal(1), z.literal(2)]).optional(),
  }),
  z.object({
    kind: z.literal("socket"),
    id: z.string().optional(),
    wall: z.string(),
    offset: z.number(),
    open: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("switch"),
    id: z.string().optional(),
    wall: z.string(),
    offset: z.number(),
    open: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("shape"),
    size: z.tuple([z.number(), z.number(), z.number()]),
    at: z.tuple([z.number(), z.number()]),
    path: z.array(z.tuple([z.number(), z.number()])),
    steps: z.array(
      z.object({ length: z.number(), turn: z.number().optional() })
    ),
    box: z.object({ w: z.number(), d: z.number().default(1) }),
    nested: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("a") }),
      z.object({ mode: z.literal("b") }),
    ]),
    note: z.string().transform((s) => s.trim()),
  }),
  z.object({ kind: z.literal("empty") }),
])

describe("discriminatorValues", () => {
  it("lists the discriminator's values in order", () => {
    expect(discriminatorValues(zThing)).toEqual([
      "door",
      "socket",
      "switch",
      "shape",
      "empty",
    ])
  })
})

describe("unionReference", () => {
  it("writes one line per variant from the schema, merging identical ones", () => {
    expect(
      unionReference(zThing, {
        omit: ["id"],
        groups: [{ label: "wall fields", fields: ["wall", "offset"] }],
        hints: { "shape.size": "[w,h,d]", path: "[[u,v],…]" },
      })
    ).toEqual([
      "- door: wall fields, hinge: start|end, leaves?: 1|2",
      "- socket|switch: wall fields, open?: true|false",
      "- shape: size: [w,h,d], at: [x,z], path: [[u,v],…], steps: [{length, turn?},…], box: {w, d?}, nested: {mode: a|b, …}, note",
      "- empty",
    ])
  })

  it("shows grouped fields as themselves when a variant lacks some of them", () => {
    const partial = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("x"), wall: z.string() }),
    ])
    expect(
      unionReference(partial, {
        groups: [{ label: "wall fields", fields: ["wall", "offset"] }],
      })
    ).toEqual(["- x: wall"])
  })
})

describe("looseUnion", () => {
  it("lists the discriminator and lets other fields through", () => {
    const loose = looseUnion(zThing, "a thing")
    expect(
      z.toJSONSchema(loose, { target: "draft-2020-12", io: "input" })
    ).toMatchObject({
      type: "object",
      properties: {
        kind: { enum: ["door", "socket", "switch", "shape", "empty"] },
      },
      required: ["kind"],
      description: "a thing",
    })
    expect(loose.parse({ kind: "door", anything: 1 })).toEqual({
      kind: "door",
      anything: 1,
    })
  })
})
