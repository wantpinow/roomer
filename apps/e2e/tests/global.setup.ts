import { execSync } from "node:child_process"

import { expect, test as setup } from "@playwright/test"

import { convex, resetAndSeed } from "../fixtures/convex"

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100"

/**
 * Push the current backend code to the e2e deployment, then wipe it.
 *
 * `e2e:setup` is idempotent: it re-sets the deployment env and redeploys, so
 * a spec run always tests the current code. The reset goes through the
 * trapdoor, which also proves the trapdoor is unlocked before any spec
 * relies on it.
 */
setup("deploy and reset the e2e backend", async () => {
  setup.setTimeout(300_000)

  execSync("pnpm --filter @roomer/backend e2e:setup", {
    stdio: "inherit",
    timeout: 300_000,
  })

  await convex.reset()
  expect(await convex.ping()).toEqual({ message: "pong", latestNote: null })
})

/**
 * Turbopack compiles each route on its first request, which can take longer
 * than a spec's expectations wait. Asking for every route once here moves
 * that cost out of the specs (and out of their timing), so a slow first
 * compile can never read as a failure.
 */
setup("compile every route once", async ({ request }) => {
  setup.setTimeout(300_000)
  const seed = await resetAndSeed()
  const routes = [
    "/",
    `/rooms/${seed.roomId}`,
    "/library",
    `/library/${seed.assetIds["generic-sofa"]}`,
    "/styleguide",
    "/render",
    "/render/sandbox",
  ]
  for (const route of routes) {
    const response = await request.get(`${BASE_URL}${route}`, {
      timeout: 180_000,
    })
    expect(response.status(), `GET ${route}`).toBeLessThan(400)
  }
})
