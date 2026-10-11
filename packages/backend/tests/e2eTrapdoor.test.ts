import { afterEach, describe, expect, it } from "vitest"

import { api } from "../convex/_generated/api"
import { assertE2E, doReset } from "../convex/e2e"
import { doRecordHealthcheck } from "../convex/health"
import { createTestConvex } from "./setup"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env.E2E_TESTING_ENABLED = ORIGINAL_ENV.E2E_TESTING_ENABLED
  process.env.CONVEX_CLOUD_URL = ORIGINAL_ENV.CONVEX_CLOUD_URL
})

function enableTrapdoor(cloudUrl = "http://127.0.0.1:3220") {
  process.env.E2E_TESTING_ENABLED = "true"
  process.env.CONVEX_CLOUD_URL = cloudUrl
}

describe("assertE2E", () => {
  it("refuses when E2E_TESTING_ENABLED is not set", () => {
    delete process.env.E2E_TESTING_ENABLED
    process.env.CONVEX_CLOUD_URL = "http://127.0.0.1:3220"
    expect(() => assertE2E()).toThrow("E2E_TESTING_ENABLED is not set")
  })

  it("refuses a non-loopback deployment even with the flag set", () => {
    enableTrapdoor("https://mild-spoonbill-181.convex.cloud")
    expect(() => assertE2E()).toThrow("only runs on a local deployment")
  })

  it("refuses when CONVEX_CLOUD_URL is unset", () => {
    enableTrapdoor()
    delete process.env.CONVEX_CLOUD_URL
    expect(() => assertE2E()).toThrow("no CONVEX_CLOUD_URL")
  })

  it("allows a flagged loopback deployment", () => {
    enableTrapdoor()
    expect(() => assertE2E()).not.toThrow()
  })
})

describe("doReset", () => {
  it("deletes every row of every table and reports the counts", async () => {
    const t = createTestConvex()
    await t.run(async (ctx) => {
      await doRecordHealthcheck(ctx, { note: "a" })
      await doRecordHealthcheck(ctx, { note: "b" })
    })
    const deleted = await t.run(async (ctx) => doReset(ctx))
    expect(deleted).toEqual({ healthchecks: 2 })
    const remaining = await t.run(async (ctx) =>
      ctx.db.query("healthchecks").collect()
    )
    expect(remaining).toHaveLength(0)
  })
})

describe("e2e.reset", () => {
  it("is refused when the trapdoor is disabled", async () => {
    delete process.env.E2E_TESTING_ENABLED
    const t = createTestConvex()
    await expect(t.mutation(api.e2e.reset, {})).rejects.toThrow(
      "E2E_TESTING_ENABLED is not set"
    )
  })
})
