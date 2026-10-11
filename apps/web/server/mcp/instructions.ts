import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// The MCP server's `instructions` are docs/agent-guide.md, verbatim — that
// file is the single source. It is read once per server process from the
// repo (found by walking up from the working directory, which is apps/web
// under `next dev` and the repo root under scripts), so editing the guide
// needs a server restart, never a code change.

export const AGENT_GUIDE_PATH = path.join("docs", "agent-guide.md")
const MAX_LEVELS = 6

/** Absolute path of a repo file, searching upwards from `from`. */
export function findRepoFile(
  relative: string,
  from: string = process.cwd()
): string {
  let dir = path.resolve(from)
  for (let level = 0; level <= MAX_LEVELS; level++) {
    const candidate = path.join(dir, relative)
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    `Can't find ${relative} above ${from}; run the server from inside the Roomer repo.`
  )
}

let cached: string | undefined

export function agentGuide(): string {
  cached ??= readFileSync(findRepoFile(AGENT_GUIDE_PATH), "utf8")
  return cached
}
