import type { McpServer } from "@modelcontextprotocol/server"
import { createMcpHandler } from "mcp-handler"

import { agentGuide } from "./instructions"
import { forMcp } from "./json-schema"
import type { RoomerTool, ToolDeps } from "./tool"
import { ROOMER_TOOLS } from "./tools"

// The Roomer MCP server: every tool from ./tools registered on an McpServer,
// with docs/agent-guide.md as the server instructions. The handler is a
// web-standard (Request) => Response served at /api/mcp/mcp.

export const SERVER_INFO = { name: "roomer", version: "0.1.0" } as const

export function registerRoomerTools(
  server: McpServer,
  deps: () => ToolDeps,
  tools: readonly RoomerTool[] = ROOMER_TOOLS
): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: forMcp(tool.inputSchema),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      },
      (args) => tool.call(args, deps())
    )
  }
}

export function createRoomerMcpHandler(
  deps: () => ToolDeps,
  tools: readonly RoomerTool[] = ROOMER_TOOLS
): (request: Request) => Promise<Response> {
  return createMcpHandler(
    (server) => registerRoomerTools(server, deps, tools),
    {
      serverInfo: SERVER_INFO,
      instructions: agentGuide(),
    }
  )
}
