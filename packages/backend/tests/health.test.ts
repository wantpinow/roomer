import { describe, expect, it } from "vitest"

import { api } from "../convex/_generated/api"
import { doPing, doRecordHealthcheck } from "../convex/health"
import { createTestConvex } from "./setup"

describe("doPing", () => {
  it("answers pong with no note on an empty database", async () => {
    const t = createTestConvex()
    const result = await t.run(async (ctx) => doPing(ctx))
    expect(result).toEqual({ message: "pong", latestNote: null })
  })

  it("reports the newest healthcheck's note", async () => {
    const t = createTestConvex()
    await t.run(async (ctx) => {
      await doRecordHealthcheck(ctx, { note: "first" })
      await doRecordHealthcheck(ctx, { note: "second" })
    })
    const result = await t.run(async (ctx) => doPing(ctx))
    expect(result.latestNote).toBe("second")
  })
})

describe("health.ping", () => {
  it("is reachable as a public query through the appQuery wrapper", async () => {
    const t = createTestConvex()
    expect(await t.query(api.health.ping, {})).toEqual({
      message: "pong",
      latestNote: null,
    })
  })
})
