import { z } from "zod"

// Compact tool listings. Core's discriminated unions (17 feature types, 6
// part shapes, layout ops, position helpers, shell ops) are precise but
// expand to tens of kilobytes of JSON Schema, which every agent session pays
// for in tokens. Tools therefore *list* a loose object that names the
// discriminator's values, describe the variants' fields in one generated
// line each, and *validate* with the full core schema in `defineTool` — so
// nothing is less safe, the reference can't drift from the schema, and
// validation errors keep their exact path and message.

type AnyUnion = z.ZodDiscriminatedUnion<readonly z.ZodObject[]>

export interface ReferenceOptions {
  /** Fields left out of every line (stated once, elsewhere). */
  omit?: readonly string[]
  /**
   * Field sets shown as one label when a variant has all of them, e.g. the
   * five wall-attachment fields → "wall fields".
   */
  groups?: readonly { label: string; fields: readonly string[] }[]
  /** Type text by "variant.field" or "field", replacing the derived one. */
  hints?: Readonly<Record<string, string>>
}

/** The discriminator's values, in the union's order. */
export function discriminatorValues(union: AnyUnion): [string, ...string[]] {
  const key = union.def.discriminator
  const values = union.options.flatMap((option) => {
    const literal = option.shape[key]
    return literal instanceof z.ZodLiteral
      ? [...literal.values].map(String)
      : []
  })
  const [first, ...rest] = values
  if (first === undefined) throw new Error(`No values for ${key}`)
  return [first, ...rest]
}

function unwrap(schema: z.ZodType): { inner: z.ZodType; optional: boolean } {
  let inner = schema
  let optional = false
  for (;;) {
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodDefault) {
      optional = true
      inner = inner.unwrap() as z.ZodType
    } else if (inner instanceof z.ZodNullable) {
      inner = inner.unwrap() as z.ZodType
    } else if (inner instanceof z.ZodPipe) {
      inner = inner.def.in as z.ZodType
    } else {
      return { inner, optional }
    }
  }
}

const TUPLE_NAMES: Record<number, string> = { 2: "[x,z]", 3: "[x,y,z]" }

/** How a field's value is written; undefined for plain numbers/strings. */
function typeText(schema: z.ZodType, hint?: string): string | undefined {
  if (hint !== undefined) return hint
  const { inner } = unwrap(schema)
  if (inner instanceof z.ZodEnum) return inner.options.join("|")
  if (inner instanceof z.ZodLiteral) return [...inner.values].join("|")
  if (inner instanceof z.ZodDiscriminatedUnion) {
    const union = inner as AnyUnion
    return `{${union.def.discriminator}: ${discriminatorValues(union).join("|")}, …}`
  }
  if (inner instanceof z.ZodUnion) {
    const options = inner.options as readonly z.ZodType[]
    const texts = options.map((option) => typeText(option) ?? "value")
    return texts.join("|")
  }
  if (inner instanceof z.ZodBoolean) return "true|false"
  if (inner instanceof z.ZodTuple) {
    const count = inner.def.items.length
    return TUPLE_NAMES[count] ?? `[${count} values]`
  }
  if (inner instanceof z.ZodArray) {
    const element = typeText(inner.element as z.ZodType)
    return element ? `[${element},…]` : "[…]"
  }
  if (inner instanceof z.ZodObject) {
    return `{${fieldList(inner.shape, "", {})}}`
  }
  return undefined
}

/** "wall, offset, hinge: start|end, leaves?: 1|2". */
function fieldList(
  shape: Readonly<Record<string, z.ZodType>>,
  variant: string,
  options: ReferenceOptions,
  skip: ReadonlySet<string> = new Set()
): string {
  return Object.entries(shape)
    .filter(([name]) => !skip.has(name) && !options.omit?.includes(name))
    .map(([name, schema]) => {
      const { optional } = unwrap(schema)
      const hint =
        options.hints?.[`${variant}.${name}`] ?? options.hints?.[name]
      const type = typeText(schema, hint)
      return `${name}${optional ? "?" : ""}${type ? `: ${type}` : ""}`
    })
    .join(", ")
}

/**
 * One line per variant of a discriminated union — "- door: wall fields,
 * hinge: start|end, …" — with variants whose fields read the same merged
 * ("- socket|switch: wall fields, gang?: 1|2").
 */
export function unionReference(
  union: AnyUnion,
  options: ReferenceOptions = {}
): string[] {
  const key = union.def.discriminator
  const lines = new Map<string, string[]>()
  for (const option of union.options) {
    const literal = option.shape[key]
    const variant =
      literal instanceof z.ZodLiteral ? [...literal.values].join("|") : "?"
    const shape: Record<string, z.ZodType> = option.shape
    const groups = (options.groups ?? []).filter((group) =>
      group.fields.every((field) => field in shape)
    )
    const skip = new Set([key, ...groups.flatMap((group) => group.fields)])
    const fields = [
      ...groups.map((group) => group.label),
      fieldList(shape, variant, options, skip),
    ]
      .filter(Boolean)
      .join(", ")
    lines.set(fields, [...(lines.get(fields) ?? []), variant])
  }
  return [...lines].map(([fields, variants]) =>
    fields ? `- ${variants.join("|")}: ${fields}` : `- ${variants.join("|")}`
  )
}

/**
 * The listed stand-in for a union: an object naming the discriminator's
 * values and allowing any other field. Only ever *listed*; arguments are
 * validated with the real union.
 */
export function looseUnion(union: AnyUnion, description: string): z.ZodType {
  return z
    .looseObject({
      [union.def.discriminator]: z.enum(discriminatorValues(union)),
    })
    .describe(description)
}
