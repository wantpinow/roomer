import type { ToolAnnotations } from "@modelcontextprotocol/server"
import type { z } from "zod"

import type { PipelineDeps } from "../pipelines/deps"

import { errorResult } from "./errors"
import type { ToolResult } from "./result"

// One MCP tool = a name, an agent-oriented description, a zod input schema
// (built from @roomer/core's schemas) and a handler. `defineTool` erases the
// schema type behind `call`, which validates the raw arguments, runs the
// handler and turns any failure into an `isError` result — so the server
// registry, the tests and the CLI all go through the same path.

export type ToolDeps = PipelineDeps

export interface ToolDefinition<Schema extends z.ZodType> {
  name: string
  title: string
  description: string
  /** What arguments are validated with (core's schemas, in full). */
  inputSchema: Schema
  /**
   * What tools/list shows, when it differs: a compact stand-in for big
   * unions, whose fields the description lists (see compact.ts).
   */
  listedSchema?: z.ZodType
  annotations?: ToolAnnotations
  handler(args: z.output<Schema>, deps: ToolDeps): Promise<ToolResult>
}

export interface RoomerTool {
  name: string
  title: string
  description: string
  inputSchema: z.ZodType
  /** The schema tools/list advertises (defaults to inputSchema). */
  listedSchema: z.ZodType
  annotations?: ToolAnnotations
  /** Validate `args`, run the handler, map failures to an error result. */
  call(args: unknown, deps: ToolDeps): Promise<ToolResult>
}

export function defineTool<Schema extends z.ZodType>(
  definition: ToolDefinition<Schema>
): RoomerTool {
  const { handler, listedSchema, ...meta } = definition
  return {
    ...meta,
    listedSchema: listedSchema ?? definition.inputSchema,
    async call(args, deps) {
      try {
        const parsed = definition.inputSchema.parse(args ?? {})
        return await handler(parsed, deps)
      } catch (error) {
        return errorResult(error)
      }
    },
  }
}

// Annotations say only what differs from MCP's defaults (not read-only,
// destructive, not idempotent, open world): destructive/idempotent hints are
// ignored for read-only tools, and every tool stays on this machine unless
// it downloads from the web (openWorld).

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
}

export const WRITES: ToolAnnotations = {
  destructiveHint: false,
  openWorldHint: false,
}

/** Writes that also fetch from the web (product and room photos, models). */
export const WRITES_WEB: ToolAnnotations = { destructiveHint: false }
