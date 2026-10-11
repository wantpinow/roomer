import { defaultCameras } from "@roomer/core/cameras"
import {
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_FINISHES,
  TEST_ASSETS,
} from "@roomer/core/fixtures"
import { toRoomGeometry } from "@roomer/core/geometry"
import type { Camera } from "@roomer/core/schema"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api } from "../convex/_generated/api"
import { doSeed, SEED_ASSETS, SEED_LAYOUT_NAME } from "../convex/seed"
import { createTestConvex, finishScheduled, type TestConvex } from "./setup"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  vi.useRealTimers()
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

describe("doSeed with refresh", () => {
  const SOFA_VIEW: Camera = {
    id: "sofa-view",
    name: "From the sofa",
    position: [600, 1100, 4000],
    target: [2900, 1100, 4000],
    fov: 55,
  }

  /** Seed, then wind the stored room back to how an older fixture had it. */
  async function seedOldRoom(t: TestConvex) {
    const seeded = await t.run(async (ctx) => doSeed(ctx))
    await t.run(async (ctx) => {
      const room = await ctx.db.get(seeded.roomId)
      if (!room) throw new Error("room missing")
      await ctx.db.patch(seeded.roomId, {
        // D1/D2 labels swapped, no beam, an extra socket, older finishes,
        // cameras from older defaults plus one of the user's own.
        features: [
          ...room.features
            .filter((f) => f.id !== "BM1")
            .map((f) =>
              f.id === "D1"
                ? { ...f, label: "Hall door" }
                : f.id === "D2"
                  ? { ...f, label: "Kitchen door" }
                  : f
            ),
          {
            type: "socket",
            id: "S9",
            wall: "W1",
            offset: 300,
            width: 86,
            bottom: 300,
            height: 86,
          },
        ],
        finishes: { walls: "soft warm white, matt", ceiling: "white" },
        cameras: [...room.cameras.map((c) => ({ ...c, fov: 50 })), SOFA_VIEW],
      })
    })
    return seeded
  }

  it("brings an existing room back in line with the fixture, in place", async () => {
    vi.useFakeTimers()
    const t = createTestConvex()
    const seeded = await seedOldRoom(t)
    const result = await t.run(async (ctx) => doSeed(ctx, { refresh: true }))
    expect(result.roomId).toBe(seeded.roomId)
    expect(result.layoutId).toBe(seeded.layoutId)
    expect(result.created).toEqual({ room: false, assets: [], layout: false })
    expect(result.refreshed).toEqual([
      "Removed socket S9",
      expect.stringMatching(/^Updated door D1: label Hall door → Kitchen door/),
      expect.stringMatching(/^Updated door D2: label Kitchen door → Hall door/),
      "Added beam BM1 from (0, 2,650) to (2,980, 2,650)",
      "Set the walls, floor, ceiling, skirting, notes finish",
      expect.stringMatching(
        /^Reset \d+ default cameras to the current defaults$/
      ),
    ])

    const room = await t.run(async (ctx) => ctx.db.get(seeded.roomId))
    // Same features as the fixture (order: kept ones first, then additions).
    expect(
      [...(room?.features ?? [])].sort((a, b) => a.id.localeCompare(b.id))
    ).toEqual(
      [...LIVING_ROOM_FEATURES].sort((a, b) => a.id.localeCompare(b.id))
    )
    expect(room?.finishes).toEqual(LIVING_ROOM_FINISHES)
    expect(room?.cameras).toEqual([
      ...defaultCameras(toRoomGeometry(room!)),
      SOFA_VIEW,
    ])
    // The layouts are re-linted against the new features.
    const jobs = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    )
    expect(jobs.map((job) => job.args[0])).toEqual([
      { layoutId: seeded.layoutId, cause: "the room's features changed" },
    ])
    await finishScheduled(t)
  })

  it("changes nothing when the room already matches", async () => {
    const t = createTestConvex()
    await t.run(async (ctx) => doSeed(ctx))
    const before = await t.run(async (ctx) => ctx.db.query("rooms").collect())
    const result = await t.run(async (ctx) => doSeed(ctx, { refresh: true }))
    expect(result.refreshed).toEqual([])
    expect(await t.run(async (ctx) => ctx.db.query("rooms").collect())).toEqual(
      before
    )
  })

  it("reports no refresh when the room was only just created", async () => {
    const t = createTestConvex()
    const result = await t.run(async (ctx) => doSeed(ctx, { refresh: true }))
    expect(result.created.room).toBe(true)
    expect(result.refreshed).toBeNull()
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
