/**
 * Shared plumbing for the seed scripts: find the local dev deployment that
 * `convex dev` wrote to .env.local, check it's up, and call functions on
 * it — internal ones through `convex run` (the CLI holds the admin key),
 * public ones through ConvexHttpClient.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server"

export const backendRoot = resolve(import.meta.dirname, "..")
export const repoRoot = resolve(backendRoot, "../..")
/** The committed design data (`pnpm seed:export` / `pnpm seed --import`). */
export const DEFAULT_SEED_FILE = resolve(repoRoot, "seed/roomer.json")
/** The Next app that renders asset previews. */
export const WEB_URL = "http://localhost:3000"

function readEnvLocal(): Record<string, string> {
  let text: string
  try {
    text = readFileSync(resolve(backendRoot, ".env.local"), "utf8")
  } catch {
    throw new Error(
      "packages/backend/.env.local is missing. Run `pnpm dev` once so `convex dev` creates the local deployment."
    )
  }
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...rest] = line.split("=")
        return [
          key!.trim(),
          rest
            .join("=")
            .trim()
            .replace(/^["']|["']$/g, ""),
        ]
      })
  )
}

/** The local dev deployment, after checking it is local and running. */
export async function devDeployment(): Promise<{
  deployment: string
  url: string
}> {
  const env = readEnvLocal()
  const deployment = env.CONVEX_DEPLOYMENT ?? ""
  if (!/^(anonymous|local):/.test(deployment)) {
    throw new Error(
      `The seed scripts only target the local dev deployment, but .env.local points at '${deployment || "nothing"}'.`
    )
  }
  const url = env.CONVEX_URL ?? "http://127.0.0.1:3210"
  try {
    await fetch(`${url}/version`)
  } catch {
    throw new Error(
      `The dev backend isn't running at ${url}. Start it with \`pnpm dev\` first.`
    )
  }
  return { deployment, url }
}

/** Run any function (internal included) with `convex run`; JSON in, JSON out. */
export function convexRun<
  F extends FunctionReference<
    "query" | "mutation" | "action",
    "public" | "internal"
  >,
>(fn: F, args: FunctionArgs<F>): FunctionReturnType<F> {
  const output = execFileSync(
    "npx",
    ["convex", "run", getFunctionName(fn), JSON.stringify(args)],
    {
      cwd: backendRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
    }
  )
  // `convex run` prints the function's return value as JSON.
  return JSON.parse(output)
}

/** Is the web app up (so it can render previews)? */
export async function webIsUp(): Promise<boolean> {
  try {
    await fetch(WEB_URL, { method: "HEAD", signal: AbortSignal.timeout(3000) })
    return true
  } catch {
    return false
  }
}

/** A path given on the command line, relative to the repo root. */
export function repoPath(path: string): string {
  return resolve(repoRoot, path)
}
