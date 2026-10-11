import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server"
import type { z } from "zod"

// Tool input schemas are sent to the agent with every tools/list, so their
// JSON Schema is kept lean: zod emits the full safe-integer range on every
// `.int()`, repeats "Length in whole millimetres" on every length (the
// server instructions say all lengths are whole mm), writes `type` next to
// enums, length limits on every string and list, three copies of the item schema
// for an [x, y, z] tuple, and a `$schema` URI per tool (2020-12 is MCP's
// default dialect anyway). None of it helps an agent fill the arguments,
// and the server validates every limit itself.
//
// `forMcp` is what the SDK registers: the compact listing, and a validator
// that accepts anything, because every tool validates its arguments itself
// with the full core schema (`defineTool`) and answers with exact paths and
// messages. Validating twice would only replace those with the SDK's
// coarser "Input validation error" — and, for tools that list a compact
// stand-in, check the wrong schema.

const GENERIC_DESCRIPTIONS = new Set([
  "Length in whole millimetres",
  "Length in whole millimetres (> 0)",
  "Length in whole millimetres (>= 0)",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Keys that add bytes but nothing an agent needs (the server validates). */
function isNoise(
  schema: Record<string, unknown>,
  key: string,
  child: unknown
): boolean {
  switch (key) {
    case "minimum":
      return child === Number.MIN_SAFE_INTEGER
    case "maximum":
      return child === Number.MAX_SAFE_INTEGER
    case "description":
      return typeof child === "string" && GENERIC_DESCRIPTIONS.has(child)
    case "type":
      // An enum or const already says what the value is.
      return "enum" in schema || "const" in schema
    case "minLength":
    case "minItems":
      return child === 1
    case "maxLength":
      return true
    case "maxItems":
      return typeof child === "number" && child >= 20
    default:
      return false
  }
}

/** [A, A, A] as prefixItems → items: A (same meaning, a third the size). */
function uniformTuple(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const { prefixItems, items } = schema
  if (!Array.isArray(prefixItems) || items !== false) return schema
  const [first, ...rest] = prefixItems.map((item) => JSON.stringify(item))
  if (first === undefined || rest.some((item) => item !== first)) return schema
  const { prefixItems: _drop, ...others } = schema
  void _drop
  return { ...others, items: prefixItems[0] }
}

/** Keywords whose value maps names to schemas (the names aren't keywords). */
const SCHEMA_MAPS = new Set(["properties", "patternProperties", "$defs"])

function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact)
  if (!isRecord(value)) return value
  const schema = uniformTuple(value)
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(schema)) {
    if (isNoise(schema, key, child)) continue
    out[key] =
      SCHEMA_MAPS.has(key) && isRecord(child)
        ? Object.fromEntries(
            Object.entries(child).map(([name, sub]) => [name, compact(sub)])
          )
        : compact(child)
  }
  return out
}

/**
 * Drops safe-integer bounds and generic unit descriptions, recursively, and
 * the root `$schema`.
 */
export function compactJsonSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const out = compact(schema)
  if (!isRecord(out)) return {}
  const { $schema, ...rest } = out
  void $schema
  return rest
}

/** A zod schema as the SDK lists it: compact JSON, no SDK-side validation. */
export function forMcp(schema: z.ZodType): StandardSchemaWithJSON {
  const standard = schema["~standard"]
  return {
    "~standard": {
      version: 1,
      vendor: "roomer",
      validate: (value) => ({ value }),
      jsonSchema: {
        input: (options) =>
          compactJsonSchema(standard.jsonSchema.input(options)),
        output: (options) =>
          compactJsonSchema(standard.jsonSchema.output(options)),
      },
    },
  }
}
