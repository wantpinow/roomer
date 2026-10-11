/**
 * Seeds the local dev deployment (`pnpm seed`): the living room, the generic
 * starter library and a "Starter" layout. Idempotent — re-running only adds
 * what's missing. `pnpm seed --refresh` also brings an existing living room
 * back in line with the fixture (features, labels, finishes, default
 * cameras), keeping its id and layouts.
 *
 * Runs the internal `seed:run` mutation through the Convex CLI against the
 * deployment `convex dev` wrote to .env.local (the anonymous local backend
 * on :3210), the way masterguest's seed script does. Start `pnpm dev` first.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type { SeedResult } from "../convex/seed"

const backendRoot = resolve(import.meta.dirname, "..")

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

async function main() {
  const env = readEnvLocal()
  const deployment = env.CONVEX_DEPLOYMENT ?? ""
  if (!/^(anonymous|local):/.test(deployment)) {
    throw new Error(
      `Seeding only targets the local dev deployment, but .env.local points at '${deployment || "nothing"}'.`
    )
  }
  const url = env.CONVEX_URL ?? "http://127.0.0.1:3210"
  try {
    await fetch(`${url}/version`)
  } catch {
    throw new Error(
      `The dev backend isn't running at ${url}. Start it with \`pnpm dev\`, then seed.`
    )
  }

  const refresh = process.argv.includes("--refresh")
  console.log(
    `Seeding ${deployment} (${url})${refresh ? " with --refresh" : ""}…`
  )
  const output = execFileSync(
    "npx",
    ["convex", "run", "seed:run", JSON.stringify({ refresh })],
    {
      cwd: backendRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }
  )
  // `convex run` prints the mutation's return value as JSON.
  const result: SeedResult = JSON.parse(output)
  const { created } = result
  console.log(
    created.room
      ? `✔ created room ${result.roomId}`
      : `• room ${result.roomId} already there`
  )
  console.log(
    created.assets.length > 0
      ? `✔ created ${created.assets.length} library assets (${created.assets.join(", ")})`
      : `• ${Object.keys(result.assetIds).length} library assets already there`
  )
  console.log(
    created.layout
      ? `✔ created layout "Starter" ${result.layoutId}`
      : `• layout "Starter" ${result.layoutId} already there`
  )
  if (result.refreshed) {
    console.log(
      result.refreshed.length > 0
        ? `✔ refreshed the room from the fixture:\n${result.refreshed.map((line) => `    ${line}`).join("\n")}`
        : "• room already matches the fixture"
    )
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
