import { execSync } from "node:child_process"

import { expect, test as setup } from "@playwright/test"

import { convex } from "../fixtures/convex"

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
