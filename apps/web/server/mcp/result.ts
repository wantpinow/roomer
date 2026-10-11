import type {
  CallToolResult,
  ImageContent,
  TextContent,
} from "@modelcontextprotocol/server"

// Building MCP tool results: a text block written for the agent, optional
// structured JSON for programs (the CLI's --json, e2e), and PNG images.

export type ToolResult = CallToolResult

export function textBlock(text: string): TextContent {
  return { type: "text", text }
}

export function pngBlock(png: Buffer): ImageContent {
  return { type: "image", data: png.toString("base64"), mimeType: "image/png" }
}

/** JSON-safe plain copy (drops undefined fields). */
function toStructured(value: object): Record<string, unknown> {
  const json: unknown = JSON.parse(JSON.stringify(value))
  return typeof json === "object" && json !== null && !Array.isArray(json)
    ? Object.fromEntries(Object.entries(json))
    : { value: json }
}

export function toolResult({
  text,
  structured,
  images = [],
}: {
  text: string
  structured?: object
  images?: readonly Buffer[]
}): ToolResult {
  return {
    content: [textBlock(text), ...images.map(pngBlock)],
    ...(structured ? { structuredContent: toStructured(structured) } : {}),
  }
}

export function toolError(text: string, structured?: object): ToolResult {
  return {
    content: [textBlock(text)],
    isError: true,
    ...(structured ? { structuredContent: toStructured(structured) } : {}),
  }
}
