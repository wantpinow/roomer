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
  inputSchema: Schema
  annotations?: ToolAnnotations
  handler(args: z.output<Schema>, deps: ToolDeps): Promise<ToolResult>
}

export interface RoomerTool {
  name: string
  title: string
  description: string
  inputSchema: z.ZodType
  annotations?: ToolAnnotations
  /** Validate `args`, run the handler, map failures to an error result. */
  call(args: unknown, deps: ToolDeps): Promise<ToolResult>
}

export function defineTool<Schema extends z.ZodType>(
  definition: ToolDefinition<Schema>
): RoomerTool {
  const { handler, ...meta } = definition
  return {
    ...meta,
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

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

export const WRITES: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}
