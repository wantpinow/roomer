/**
 * Prepares the e2e Convex deployment: env vars, then a code push.
 *
 * Runs against the local backend started by `scripts/e2e-backend.ts` (port
 * 3220), and is idempotent — Playwright's global setup calls it on every run,
 * so a spec run always tests the current code. Data is wiped by the
 * `e2e:reset` trapdoor in apps/e2e/tests/global.setup.ts, not here.
 *
 * Env vars are set before the push: once a convex/env.ts validates at
 * analysis time (as masterguest's does), a push without them is rejected.
 */
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const backendRoot = resolve(import.meta.dirname, "..")
const envFile = resolve(backendRoot, ".env.e2e")
const convexUrl = process.env.E2E_CONVEX_URL ?? "http://127.0.0.1:3220"

/** Deployment env for the e2e backend. All local, all throwaway. */
const DEPLOYMENT_ENV: Record<string, string> = {
  // Unlocks convex/e2e.ts. Setting this on any other deployment is what the
  // guards in e2e.ts exist to catch.
  E2E_TESTING_ENABLED: "true",
}

function convex(args: string[]): string {
  return execFileSync("npx", ["convex", ...args, "--env-file", envFile], {
    cwd: backendRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
}

async function waitForBackend(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${convexUrl}/version`)
      if (response.ok) return
    } catch {
      // Backend still booting.
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Convex backend never came up at ${convexUrl}`)
}

async function main() {
  if (!existsSync(envFile)) {
    throw new Error(
      `${envFile} is missing — start the backend first (pnpm --filter @roomer/backend e2e:backend).`
    )
  }

  await waitForBackend()

  for (const [key, value] of Object.entries(DEPLOYMENT_ENV)) {
    convex(["env", "set", key, value])
  }
  console.log("✔ e2e deployment env set")

  // `pnpm typecheck` is the real gate; letting the CLI re-run tsc here only
  // means an unrelated in-flight type error elsewhere in the repo blocks the
  // suite from starting. Codegen is off so an e2e run never rewrites
  // convex/_generated under a concurrent `pnpm dev`.
  convex(["deploy", "-y", "--typecheck", "disable", "--codegen", "disable"])
  console.log("✔ e2e functions deployed")
}

await main()
