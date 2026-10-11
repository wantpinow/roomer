import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// Pure helpers for `pnpm mcp` (scripts/mcp-call.ts): argument parsing,
// where tool arguments come from, and how returned images are named.

export const DEFAULT_MCP_URL = "http://localhost:3000/api/mcp/mcp"

export type CliCommand =
  | { kind: "help" }
  | { kind: "list"; json: boolean }
  | { kind: "instructions" }
  | {
      kind: "call"
      tool: string
      /** Raw JSON text or `@path/to/args.json`. */
      args: string | undefined
      json: boolean
      outDir: string | undefined
    }

export const USAGE = `usage:
  pnpm mcp --list [--json]              list the tools (--json: full definitions)
  pnpm mcp --instructions               print the server instructions (agent guide)
  pnpm mcp <tool> ['<json>' | @args.json] [--json] [--out <dir>]

  Prints the text result; images are written to .roomer-out/mcp/ and their
  paths printed. --json also prints structuredContent. Exit code 1 when the
  tool reports an error. ROOMER_MCP_URL overrides ${DEFAULT_MCP_URL}.

  e.g. pnpm mcp get_overview
       pnpm mcp render_plan '{"layoutId":"…"}'
       pnpm mcp create_asset @seed/mori.json`

export function parseCliArgs(argv: readonly string[]): CliCommand {
  const flags = new Set(argv.filter((a) => a.startsWith("--")))
  const positional: string[] = []
  let outDir: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "--out") {
      outDir = argv[++i]
      if (!outDir) throw new Error("--out needs a directory")
    } else if (!arg.startsWith("--")) {
      positional.push(arg)
    }
  }
  const json = flags.has("--json")
  if (flags.has("--help") || flags.has("-h")) return { kind: "help" }
  if (flags.has("--list")) return { kind: "list", json }
  if (flags.has("--instructions")) return { kind: "instructions" }
  const known = new Set([
    "--json",
    "--out",
    "--list",
    "--instructions",
    "--help",
  ])
  const unknown = [...flags].filter((f) => !known.has(f))
  if (unknown.length > 0)
    throw new Error(`Unknown option ${unknown.join(", ")}`)
  const [tool, args, ...extra] = positional
  if (!tool) return { kind: "help" }
  if (extra.length > 0) {
    throw new Error(
      `Pass the tool's arguments as one JSON string (quote it), got ${extra.length + 1} arguments`
    )
  }
  return { kind: "call", tool, args, json, outDir }
}

/**
 * Tool arguments: inline JSON, or `@file` resolved against the first
 * existing of `bases` (pnpm runs scripts in apps/web, people type paths from
 * wherever they are).
 */
export function readToolArgs(
  raw: string | undefined,
  bases: readonly string[]
): Record<string, unknown> {
  if (raw === undefined || raw.trim() === "") return {}
  let text = raw
  if (raw.startsWith("@")) {
    const relative = raw.slice(1)
    const candidates = path.isAbsolute(relative)
      ? [relative]
      : bases.map((base) => path.resolve(base, relative))
    const file = candidates.find((candidate) => existsSync(candidate))
    if (!file) {
      throw new Error(
        `Can't find ${relative} (looked in ${candidates.join(", ")})`
      )
    }
    text = readFileSync(file, "utf8")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(
      `Arguments aren't valid JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Arguments must be a JSON object")
  }
  return Object.fromEntries(Object.entries(parsed))
}

const pad = (value: number) => String(value).padStart(2, "0")

/** Local time as yyyymmdd-hhmmss. */
export function fileTimestamp(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}

/** `<yyyymmdd-hhmmss>-<tool>-<n>.png` (n from 1). */
export function imageFileName(
  date: Date,
  tool: string,
  index: number,
  mimeType: string
): string {
  return `${fileTimestamp(date)}-${tool}-${index}.${EXTENSIONS[mimeType] ?? "bin"}`
}

/** "get_overview — Overview (start here): Start here." */
export function toolSummary(tool: {
  name: string
  title?: string | undefined
  description?: string | undefined
}): string {
  const firstSentence = tool.description?.split(/(?<=\.)\s/)[0] ?? ""
  return `${tool.name}${tool.title ? ` — ${tool.title}` : ""}${firstSentence ? `: ${firstSentence}` : ""}`
}
