import { TEST_ASSETS } from "@roomer/core/fixtures"
import { afterEach, describe, expect, it } from "vitest"

import { api } from "../convex/_generated/api"
import { doSeed, SEED_ASSETS, SEED_LAYOUT_NAME } from "../convex/seed"
import { createTestConvex, type TestConvex } from "./setup"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env.E2E_TESTING_ENABLED = ORIGINAL_ENV.E2E_TESTING_ENABLED
  process.env.CONVEX_CLOUD_URL = ORIGINAL_ENV.CONVEX_CLOUD_URL
})

async function counts(t: TestConvex) {
  return await t.run(async (ctx) => ({
    rooms: (await ctx.db.query("rooms").collect()).length,
    assets: (await ctx.db.query("assets").collect()).length,
    layouts: (await ctx.db.query("layouts").collect()).length,
    events: (await ctx.db.query("layoutEvents").collect()).length,
  }))
}

describe("doSeed", () => {
  it("creates the living room, the generic library and the Starter layout", async () => {
    const t = createTestConvex()
    const result = await t.run(async (ctx) => doSeed(ctx))
    expect(result.created).toEqual({
      room: true,
      assets: SEED_ASSETS.map((a) => a.key),
      layout: true,
    })
    expect(Object.keys(result.assetIds).sort()).toEqual([
      "generic-coffee-table",
      "generic-dining-chair",
      "generic-dining-table",
      "generic-pendant-lamp",
      "generic-rug",
      "generic-sideboard",
      "generic-sofa",
      "generic-wall-tv",
    ])

    const room = await t.query(api.rooms.get, { roomId: result.roomId })
    expect(room?.name).toBe("Living room")
    const sofa = await t.query(api.assets.getByKey, { key: "generic-sofa" })
    expect(sofa).toMatchObject({
      name: "Generic three-seat sofa",
      source: "library",
      dims: TEST_ASSETS.sofa.dims,
    })

    const layout = await t.query(api.layouts.get, { layoutId: result.layoutId })
    expect(layout?.name).toBe(SEED_LAYOUT_NAME)
    expect(layout?.revision).toBe(1)
    expect(layout?.placements.map((p) => [p.id, p.assetId])).toEqual([
      ["sofa", result.assetIds["generic-sofa"]],
      ["coffee-table", result.assetIds["generic-coffee-table"]],
      ["rug", result.assetIds["generic-rug"]],
    ])
    expect(layout?.relations.sofa?.facingDescription).toContain(
      "back against W6"
    )
    const events = await t.query(api.layouts.events, {
      layoutId: result.layoutId,
    })
    expect(events.map((e) => e.actor)).toEqual(["system", "system"])
  })

  it("is idempotent: a second run finds everything and creates nothing", async () => {
    const t = createTestConvex()
    const first = await t.run(async (ctx) => doSeed(ctx))
    const before = await counts(t)
    const second = await t.run(async (ctx) => doSeed(ctx))
    expect(second).toEqual({
      ...first,
      created: { room: false, assets: [], layout: false },
    })
    expect(await counts(t)).toEqual(before)
  })

  it("fills in only what's missing", async () => {
    const t = createTestConvex()
    const first = await t.run(async (ctx) => doSeed(ctx))
    await t.run(async (ctx) => {
      await ctx.db.delete(first.layoutId)
      await ctx.db.delete(first.assetIds["generic-wall-tv"]!)
    })
    const second = await t.run(async (ctx) => doSeed(ctx))
    expect(second.created).toEqual({
      room: false,
      assets: ["generic-wall-tv"],
      layout: true,
    })
    expect(second.roomId).toBe(first.roomId)
  })
})

describe("e2e.seedLivingRoom", () => {
  it("seeds through the trapdoor when it is enabled", async () => {
    process.env.E2E_TESTING_ENABLED = "true"
    process.env.CONVEX_CLOUD_URL = "http://127.0.0.1:3220"
    const t = createTestConvex()
    const result = await t.mutation(api.e2e.seedLivingRoom, {})
    expect(result.created.room).toBe(true)
  })

  it("is refused when the trapdoor is disabled", async () => {
    delete process.env.E2E_TESTING_ENABLED
    const t = createTestConvex()
    await expect(t.mutation(api.e2e.seedLivingRoom, {})).rejects.toThrow(
      "E2E_TESTING_ENABLED is not set"
    )
  })
})
