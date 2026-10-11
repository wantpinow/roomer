/**
 * The Roomer MCP server as an agent sees it: a real
 * `@modelcontextprotocol/client` over Streamable HTTP against the e2e Next
 * server, with tool results split into what specs assert on (the agent's
 * text, the structured JSON, decoded PNGs).
 */
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100"
export const MCP_URL = `${BASE_URL}/api/mcp/mcp`

/** Headless renders and photoreal runs outlast the SDK's 60s default. */
const CALL_TIMEOUT_MS = 180_000

export interface ToolCall {
  /** The text blocks, joined: what the agent reads. */
  text: string
  /** `structuredContent`: what programs read. */
  structured: Record<string, unknown>
  /** Image blocks, decoded from base64. */
  images: { mimeType: string; data: Buffer }[]
  isError: boolean
}

export interface RoomerMcp {
  client: Client
  /** Call a tool and split its result; never throws on `isError`. */
  call(name: string, args?: Record<string, unknown>): Promise<ToolCall>
  /** Call a tool that must succeed; throws its text when it doesn't. */
  ok(name: string, args?: Record<string, unknown>): Promise<ToolCall>
  close(): Promise<void>
}

/** `structuredContent` may be any JSON value; Roomer's tools send objects. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
}

export async function connectMcp(name = "roomer-e2e"): Promise<RoomerMcp> {
  const client = new Client({ name, version: "0.0.0" })
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)))

  const call = async (
    tool: string,
    args: Record<string, unknown> = {}
  ): Promise<ToolCall> => {
    const result = await client.callTool(
      { name: tool, arguments: args },
      { timeout: CALL_TIMEOUT_MS }
    )
    const texts: string[] = []
    const images: ToolCall["images"] = []
    for (const block of result.content) {
      if (block.type === "text") texts.push(block.text)
      else if (block.type === "image") {
        images.push({
          mimeType: block.mimeType,
          data: Buffer.from(block.data, "base64"),
        })
      }
    }
    return {
      text: texts.join("\n"),
      structured: asRecord(result.structuredContent),
      images,
      isError: result.isError === true,
    }
  }

  return {
    client,
    call,
    ok: async (tool, args) => {
      const result = await call(tool, args)
      if (result.isError) {
        throw new Error(`${tool} failed:\n${result.text}`)
      }
      return result
    },
    close: () => client.close(),
  }
}
