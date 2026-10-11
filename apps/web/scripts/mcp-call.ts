/**
 * `pnpm mcp <tool> '<json args>'` — call a tool on the running Roomer MCP
 * server and print the result (see USAGE in server/mcp/cli.ts).
 *
 * Connects with @modelcontextprotocol/client over Streamable HTTP to
 * ROOMER_MCP_URL (default http://localhost:3000/api/mcp/mcp), prints text
 * content, writes images to .roomer-out/mcp/<yyyymmdd-hhmmss>-<tool>-<n>.png
 * and prints their paths. Exit code 1 when the tool reports an error.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"

import {
  DEFAULT_MCP_URL,
  imageFileName,
  parseCliArgs,
  readToolArgs,
  toolSummary,
  USAGE,
} from "../server/mcp/cli"

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
/** Photoreal renders take minutes; the SDK default (60s) is too short. */
const CALL_TIMEOUT_MS = 10 * 60_000

async function connect(url: string): Promise<Client> {
  const client = new Client({ name: "roomer-cli", version: "0.1.0" })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  } catch (error) {
    throw new Error(
      `Can't reach the Roomer MCP server at ${url} (${error instanceof Error ? error.message : String(error)}). Is \`pnpm dev\` running?`
    )
  }
  return client
}

async function main(): Promise<number> {
  const command = parseCliArgs(process.argv.slice(2))
  if (command.kind === "help") {
    console.log(USAGE)
    return 0
  }
  const url = process.env.ROOMER_MCP_URL || DEFAULT_MCP_URL
  const client = await connect(url)
  try {
    if (command.kind === "instructions") {
      console.log(client.getInstructions() ?? "(no instructions)")
      return 0
    }
    if (command.kind === "list") {
      const { tools } = await client.listTools()
      console.log(
        command.json
          ? JSON.stringify(tools, null, 2)
          : tools.map(toolSummary).join("\n")
      )
      return 0
    }

    // pnpm runs this in apps/web; INIT_CWD is where `pnpm mcp` was typed.
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by pnpm, not a build input
    const invokedFrom = process.env.INIT_CWD
    const args = readToolArgs(command.args, [
      ...(invokedFrom ? [invokedFrom] : []),
      process.cwd(),
      REPO_ROOT,
    ])
    const result = await client.callTool(
      { name: command.tool, arguments: args },
      { timeout: CALL_TIMEOUT_MS }
    )

    const outDir = path.resolve(
      command.outDir ?? path.join(REPO_ROOT, ".roomer-out", "mcp")
    )
    const now = new Date()
    let imageIndex = 0
    for (const block of result.content) {
      if (block.type === "text") {
        console.log(block.text)
      } else if (block.type === "image") {
        imageIndex++
        await mkdir(outDir, { recursive: true })
        const file = path.join(
          outDir,
          imageFileName(now, command.tool, imageIndex, block.mimeType)
        )
        await writeFile(file, Buffer.from(block.data, "base64"))
        console.log(`[image ${imageIndex}] ${file}`)
      } else {
        console.log(`[${block.type} content]`)
      }
    }
    if (command.json && result.structuredContent !== undefined) {
      console.log("\nstructuredContent:")
      console.log(JSON.stringify(result.structuredContent, null, 2))
    }
    return result.isError ? 1 : 0
  } finally {
    await client.close()
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
)
