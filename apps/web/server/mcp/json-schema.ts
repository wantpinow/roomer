import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server"
import type { z } from "zod"

// Tool input schemas are sent to the agent with every tools/list, so their
// JSON Schema is worth keeping lean. zod emits the full safe-integer range
// on every `.int()` and repeats "Length in whole millimetres" on every
// length — noise once the server instructions say all lengths are whole mm.
// `forMcp` keeps zod's validation and strips that noise from the listing.

const GENERIC_DESCRIPTIONS = new Set([
  "Length in whole millimetres",
  "Length in whole millimetres (> 0)",
  "Length in whole millimetres (>= 0)",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact)
  if (!isRecord(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === "minimum" && child === Number.MIN_SAFE_INTEGER) continue
    if (key === "maximum" && child === Number.MAX_SAFE_INTEGER) continue
    if (
      key === "description" &&
      typeof child === "string" &&
      GENERIC_DESCRIPTIONS.has(child)
    ) {
      continue
    }
    out[key] = compact(child)
  }
  return out
}

/** Drops safe-integer bounds and generic unit descriptions, recursively. */
export function compactJsonSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const out = compact(schema)
  return isRecord(out) ? out : {}
}

/** A zod schema as the MCP SDK takes it, with a compact JSON Schema. */
export function forMcp<Schema extends z.ZodType>(
  schema: Schema
): StandardSchemaWithJSON<z.input<Schema>, z.output<Schema>> {
  const standard = schema["~standard"]
  return {
    "~standard": {
      ...standard,
      jsonSchema: {
        input: (options) =>
          compactJsonSchema(standard.jsonSchema.input(options)),
        output: (options) =>
          compactJsonSchema(standard.jsonSchema.output(options)),
      },
    },
  }
}
