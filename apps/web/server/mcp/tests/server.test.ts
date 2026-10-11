import { readFileSync } from "node:fs"
import path from "node:path"

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { describe, expect, it } from "vitest"

import { AGENT_GUIDE_PATH, agentGuide, findRepoFile } from "../instructions"
import { forMcp } from "../json-schema"
import { createRoomerMcpHandler, SERVER_INFO } from "../server"
import { ROOMER_TOOLS } from "../tools"

import { fakeDeps, LAYOUT_ID, textOf } from "./fakes"

const CONTRACT = [
  "get_overview",
  "get_room",
  "create_room",
  "set_room_shell",
  "apply_shell_changes",
  "add_room_photos",
  "list_cameras",
  "set_camera",
  "search_assets",
  "get_asset",
  "create_asset",
  "update_asset",
  "preview_asset",
  "add_asset_images",
  "list_layouts",
  "get_layout",
  "create_layout",
  "update_layout",
  "apply_changes",
  "lint_layout",
  "render_plan",
  "render_view",
  "render_photoreal",
  "list_renders",
]

describe("the tool registry", () => {
  it("has exactly the contracted tool names, once each", () => {
    expect(ROOMER_TOOLS.map((tool) => tool.name)).toEqual(CONTRACT)
  })

  it("gives every tool a title and a description", () => {
    for (const tool of ROOMER_TOOLS) {
      expect(tool.title.length, tool.name).toBeGreaterThan(3)
      expect(tool.description.length, tool.name).toBeGreaterThan(40)
    }
  })

  it("lists every input schema as a compact JSON object schema", () => {
    for (const tool of ROOMER_TOOLS) {
      const json = forMcp(tool.inputSchema)["~standard"].jsonSchema.input({
        target: "draft-2020-12",
      })
      expect(json.type, tool.name).toBe("object")
      expect(JSON.stringify(json), tool.name).not.toContain("9007199254740991")
    }
  })
})

describe("instructions", () => {
  it("are docs/agent-guide.md, read from the repo", () => {
    const file = findRepoFile(AGENT_GUIDE_PATH)
    expect(path.basename(file)).toBe("agent-guide.md")
    expect(agentGuide()).toBe(readFileSync(file, "utf8"))
    expect(agentGuide()).toMatch(/^# Roomer/)
  })

  it("fail clearly outside the repo", () => {
    expect(() => findRepoFile("docs/nope.md", "/")).toThrow(
      "Can't find docs/nope.md above /"
    )
  })
})

describe("the MCP handler", () => {
  async function connect() {
    const deps = fakeDeps()
    const handler = createRoomerMcpHandler(() => deps)
    const client = new Client({ name: "test", version: "0.0.0" })
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("http://localhost:3000/api/mcp/mcp"),
        {
          fetch: (input, init) => handler(new Request(input, init)),
        }
      )
    )
    return { client, deps }
  }

  it("serves the instructions, the tools and their results over MCP", async () => {
    const { client, deps } = await connect()
    expect(client.getServerVersion()).toMatchObject(SERVER_INFO)
    expect(client.getInstructions()).toBe(agentGuide())
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual(CONTRACT)
    const result = await client.callTool({
      name: "lint_layout",
      arguments: { layoutId: LAYOUT_ID },
    })
    expect(textOf(result)).toMatch(/^Layout "Starter" at revision 3\./)
    expect(deps.api.layouts.get).toHaveBeenCalledWith({ layoutId: LAYOUT_ID })
    await client.close()
  })

  it("returns schema failures as tool errors the agent can read", async () => {
    const { client } = await connect()
    const result = await client.callTool({ name: "get_layout", arguments: {} })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("layoutId")
    await client.close()
  })
})
