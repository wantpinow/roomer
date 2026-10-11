import type { AddOp, LayoutOp, LintReport } from "@roomer/core/schema"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "../convex/_generated/api"
import type { Id } from "../convex/_generated/dataModel"
import { doUpdateAsset } from "../convex/assets"
import {
  bestLayout,
  doApplyChanges,
  doCreateLayout,
  doGetLayout,
  doListEvents,
  doListLayouts,
  doRelintLayout,
  doRemoveLayout,
  doRoomActivity,
  doScheduleRelintAll,
  doUpdateLayout,
  layoutPrice,
} from "../convex/layouts"
import { doApplyShellChanges } from "../convex/rooms"
import {
  createLayout,
  createLivingRoom,
  createTestAsset,
  createTestConvex,
  expectAppError,
  fakeStorageId,
  finishScheduled,
  type TestConvex,
} from "./setup"

// Lint is core's job and is tested there. Here it is a spy returning a
// fixed report, so these tests check what the backend does with whatever
// lint says — store it, return it, log count changes — independently of the
// real rules.
vi.mock("@roomer/core/lint", async (importOriginal) => {
  const original = await importOriginal<typeof import("@roomer/core/lint")>()
  return { ...original, lint: vi.fn(original.lint) }
})
const { lint } = await import("@roomer/core/lint")
const lintSpy = vi.mocked(lint)

const CLEAN: LintReport = {
  ok: true,
  counts: { error: 0, warning: 0, info: 0 },
  issues: [],
}

const ONE_ERROR: LintReport = {
  ok: false,
  counts: { error: 1, warning: 0, info: 0 },
  issues: [
    {
      code: "E001",
      severity: "error",
      message: "Sofa overlaps Coffee table by 120mm × 340mm.",
      placementIds: ["sofa", "coffee-table"],
      featureIds: [],
    },
  ],
}

beforeEach(() => {
  vi.useFakeTimers()
  lintSpy.mockReturnValue(CLEAN)
})
afterEach(() => {
  vi.useRealTimers()
  lintSpy.mockReset()
})

const SOFA_AGAINST_W6: AddOp = {
  op: "add",
  id: "sofa",
  asset: "test-sofa",
  position: { mode: "against", wall: "W6", at: 3700 },
}
const COFFEE_TABLE_IN_FRONT: AddOp = {
  op: "add",
  id: "coffee-table",
  asset: "test-coffee-table",
  position: { mode: "centerOn", placement: "sofa", dx: 1175 },
}
const RUG_UNDER_TABLE: AddOp = {
  op: "add",
  id: "rug",
  asset: "test-rug",
  position: { mode: "centerOn", placement: "coffee-table" },
}

interface World {
  t: TestConvex
  roomId: Id<"rooms">
  layoutId: Id<"layouts">
  sofa: Id<"assets">
  coffeeTable: Id<"assets">
  rug: Id<"assets">
}

/** The living room, three priced assets and an empty layout. */
async function world(): Promise<World> {
  const t = createTestConvex()
  const roomId = await createLivingRoom(t)
  const sofa = await createTestAsset(t, "sofa", { price: 1299 })
  const coffeeTable = await createTestAsset(t, "coffeeTable", { price: 249.5 })
  const rug = await createTestAsset(t, "rug")
  const layoutId = await createLayout(t, roomId, "Living")
  return { t, roomId, layoutId, sofa, coffeeTable, rug }
}

async function apply(
  w: World,
  ops: LayoutOp[],
  extra: { expectedRevision?: number; actor?: "agent" | "user" } = {}
) {
  return await w.t.run(async (ctx) =>
    doApplyChanges(ctx, {
      layoutId: w.layoutId,
      ops,
      actor: extra.actor ?? "agent",
      ...(extra.expectedRevision !== undefined
        ? { expectedRevision: extra.expectedRevision }
        : {}),
    })
  )
}

async function getLayout(t: TestConvex, layoutId: Id<"layouts">) {
  const layout = await t.run(async (ctx) => ctx.db.get(layoutId))
  if (!layout) throw new Error("layout missing")
  return layout
}

async function refs(t: TestConvex, layoutId: Id<"layouts">) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("layoutAssetRefs")
        .withIndex("by_layout", (q) => q.eq("layoutId", layoutId))
        .collect()
    )
      .map((r) => r.assetId)
      .sort()
  )
}

async function events(t: TestConvex, layoutId: Id<"layouts">) {
  return await t.run(async (ctx) => doListEvents(ctx, { layoutId }))
}

describe("doCreateLayout", () => {
  it("creates an empty draft at revision 0 with a lint report and an event", async () => {
    const w = await world()
    const layout = await getLayout(w.t, w.layoutId)
    expect(layout).toMatchObject({
      roomId: w.roomId,
      name: "Living",
      status: "draft",
      placements: [],
      revision: 0,
      lint: CLEAN,
    })
    expect((await events(w.t, w.layoutId)).map((e) => e.summary)).toEqual([
      "Created layout 'Living'",
    ])
  })

  it("forks a layout: placements, finishes and refs copied, parent recorded", async () => {
    const w = await world()
    await apply(w, [
      SOFA_AGAINST_W6,
      { ...RUG_UNDER_TABLE, position: { mode: "centerOn", placement: "sofa" } },
    ])
    await w.t.run(async (ctx) =>
      doUpdateLayout(ctx, { layoutId: w.layoutId, finishes: { walls: "sage" } })
    )
    const parent = await getLayout(w.t, w.layoutId)
    const { layoutId: forkId } = await w.t.run(async (ctx) =>
      doCreateLayout(ctx, {
        roomId: w.roomId,
        name: "Living (rug variant)",
        fromLayoutId: w.layoutId,
        actor: "agent",
      })
    )
    const fork = await getLayout(w.t, forkId)
    expect(fork).toMatchObject({
      parentId: w.layoutId,
      placements: parent.placements,
      finishes: { walls: "sage" },
      revision: 0,
      status: "draft",
    })
    expect(await refs(w.t, forkId)).toEqual([w.sofa, w.rug].sort())
    const [created] = await events(w.t, forkId)
    expect(created).toMatchObject({
      actor: "agent",
      summary: "Forked 'Living' as 'Living (rug variant)' (2 items)",
    })
  })

  it("refuses to fork a layout of another room, or into a missing room", async () => {
    const w = await world()
    const otherRoom = await createLivingRoom(w.t)
    await expectAppError(
      w.t.run(async (ctx) =>
        doCreateLayout(ctx, {
          roomId: otherRoom,
          name: "Copy",
          fromLayoutId: w.layoutId,
        })
      ),
      "INVALID_INPUT",
      "belongs to a different room"
    )
    await w.t.run(async (ctx) => ctx.db.delete(otherRoom))
    await expectAppError(
      w.t.run(async (ctx) =>
        doCreateLayout(ctx, { roomId: otherRoom, name: "Lost" })
      ),
      "NOT_FOUND",
      "There's no room with id"
    )
  })
})

describe("doApplyChanges", () => {
  it("resolves assets by key or id, places them and returns the new state", async () => {
    const w = await world()
    const result = await apply(w, [
      SOFA_AGAINST_W6,
      { ...COFFEE_TABLE_IN_FRONT, asset: w.coffeeTable },
      RUG_UNDER_TABLE,
    ])
    expect(result.revision).toBe(1)
    expect(result.placements).toEqual([
      {
        id: "sofa",
        assetId: w.sofa,
        x: 493,
        z: 3990,
        facing: 90,
        elevation: 0,
      },
      {
        id: "coffee-table",
        assetId: w.coffeeTable,
        x: 1668,
        z: 3990,
        facing: 90,
        elevation: 0,
      },
      { id: "rug", assetId: w.rug, x: 1668, z: 3990, facing: 90, elevation: 0 },
    ])
    expect(result.changes.map((c) => [c.index, c.op, c.id])).toEqual([
      [0, "add", "sofa"],
      [1, "add", "coffee-table"],
      [2, "add", "rug"],
    ])
    expect(result.lint).toEqual(lintSpy.mock.results.at(-1)?.value)
    const layout = await getLayout(w.t, w.layoutId)
    expect(layout.placements).toEqual(result.placements)
    expect(layout.revision).toBe(1)
    expect(layout.lint).toEqual(result.lint)
  })

  it("lints with the room geometry and every placed asset keyed by id", async () => {
    const w = await world()
    await apply(w, [SOFA_AGAINST_W6, COFFEE_TABLE_IN_FRONT])
    const input = lintSpy.mock.calls.at(-1)?.[0]
    expect(input?.room.corners).toHaveLength(6)
    expect(input?.placements.map((p) => p.id)).toEqual(["sofa", "coffee-table"])
    expect(Object.keys(input?.assets ?? {}).sort()).toEqual(
      [w.sofa, w.coffeeTable].sort()
    )
    expect(input?.assets[w.sofa]).not.toHaveProperty("key")
  })

  it("stores whatever lint reports and returns it", async () => {
    const w = await world()
    lintSpy.mockReturnValue(ONE_ERROR)
    const result = await apply(w, [SOFA_AGAINST_W6])
    expect(result.lint).toEqual(ONE_ERROR)
    expect((await getLayout(w.t, w.layoutId)).lint).toEqual(ONE_ERROR)
    const [latest] = await events(w.t, w.layoutId)
    expect(latest?.lintCounts).toEqual(ONE_ERROR.counts)
  })

  it("appends one event per call with a combined summary", async () => {
    const w = await world()
    await apply(w, [SOFA_AGAINST_W6, COFFEE_TABLE_IN_FRONT])
    await apply(w, [{ op: "nudge", id: "coffee-table", dx: 150 }], {
      actor: "user",
    })
    const feed = await events(w.t, w.layoutId)
    expect(feed.map((e) => [e.revision, e.actor])).toEqual([
      [2, "user"],
      [1, "agent"],
      [0, "agent"],
    ])
    expect(feed[1]?.summary).toBe(
      "Added Test three-seat sofa (sofa) against W6 at 3,700mm, added Test coffee table (coffee-table) centred on sofa offset by (1,175, 0)"
    )
    expect(feed[1]?.changes).toHaveLength(2)
    expect(feed[0]?.summary).toBe("Moved coffee-table 150mm right")
  })

  it("keeps the asset refs in step with the placements", async () => {
    const w = await world()
    await apply(w, [SOFA_AGAINST_W6, COFFEE_TABLE_IN_FRONT, RUG_UNDER_TABLE])
    expect(await refs(w.t, w.layoutId)).toEqual(
      [w.sofa, w.coffeeTable, w.rug].sort()
    )
    await apply(w, [
      { op: "remove", id: "rug" },
      { op: "swap", id: "coffee-table", asset: "test-sofa" },
    ])
    expect(await refs(w.t, w.layoutId)).toEqual([w.sofa])
  })

  it("rejects a stale expectedRevision with CONFLICT and applies a current one", async () => {
    const w = await world()
    await apply(w, [SOFA_AGAINST_W6], { expectedRevision: 0 })
    await expectAppError(
      apply(w, [{ op: "remove", id: "sofa" }], { expectedRevision: 0 }),
      "CONFLICT",
      "Layout 'Living' is at revision 1, not 0"
    )
    expect((await getLayout(w.t, w.layoutId)).placements).toHaveLength(1)
    const result = await apply(w, [{ op: "remove", id: "sofa" }], {
      expectedRevision: 1,
    })
    expect(result.revision).toBe(2)
  })

  it("reports a failing op as INVALID_OP with its index, applying nothing", async () => {
    const w = await world()
    const unknownAsset = await expectAppError(
      apply(w, [SOFA_AGAINST_W6, { ...RUG_UNDER_TABLE, asset: "no-such-rug" }]),
      "INVALID_OP",
      "ops[1] (add): no asset 'no-such-rug'"
    )
    expect(unknownAsset.opIndex).toBe(1)
    expect(unknownAsset.issues).toEqual([
      {
        path: "ops[1]",
        message:
          "no asset 'no-such-rug'. Use an asset id or key from search_assets.",
      },
    ])
    const badWall = await expectAppError(
      apply(w, [
        {
          ...SOFA_AGAINST_W6,
          position: { mode: "against", wall: "W9", at: 0 },
        },
      ]),
      "INVALID_OP",
      "this room has walls W1–W6"
    )
    expect(badWall.opIndex).toBe(0)
    await expectAppError(
      apply(w, [
        { op: "move", id: "ghost", position: { mode: "at", x: 1, z: 1 } },
      ]),
      "INVALID_OP",
      "no placement with id 'ghost'"
    )
    const layout = await getLayout(w.t, w.layoutId)
    expect(layout.revision).toBe(0)
    expect(layout.placements).toEqual([])
    expect(await events(w.t, w.layoutId)).toHaveLength(1)
  })

  it("rejects malformed ops with INVALID_INPUT and zod paths", async () => {
    const w = await world()
    const error = await expectAppError(
      apply(w, [{ ...SOFA_AGAINST_W6, id: "Big Sofa" }]),
      "INVALID_INPUT"
    )
    expect(error.issues?.map((i) => i.path)).toEqual(["ops[0].id"])
    await expectAppError(apply(w, []), "INVALID_INPUT")
  })

  it("is NOT_FOUND for a missing layout", async () => {
    const w = await world()
    await w.t.run(async (ctx) => doRemoveLayout(ctx, { layoutId: w.layoutId }))
    await expectAppError(apply(w, [SOFA_AGAINST_W6]), "NOT_FOUND")
  })

  it("is reachable as a public mutation that refuses the system actor", async () => {
    const w = await world()
    const result = await w.t.mutation(api.layouts.applyChanges, {
      layoutId: w.layoutId,
      actor: "agent",
      ops: [SOFA_AGAINST_W6],
    })
    expect(result.revision).toBe(1)
    await expect(
      w.t.mutation(api.layouts.applyChanges, {
        layoutId: w.layoutId,
        // @ts-expect-error -- only the agent or a user call public mutations
        actor: "system",
        ops: [{ op: "remove", id: "sofa" }],
      })
    ).rejects.toThrow()
  })
})

describe("doUpdateLayout", () => {
  it("records name, notes and status changes without bumping the revision", async () => {
    const w = await world()
    const result = await w.t.run(async (ctx) =>
      doUpdateLayout(ctx, {
        layoutId: w.layoutId,
        name: "Sofa on the long wall",
        notes: "Keeps the door swing clear.",
        status: "candidate",
        actor: "agent",
      })
    )
    expect(result.revision).toBe(0)
    const layout = await getLayout(w.t, w.layoutId)
    expect(layout).toMatchObject({
      name: "Sofa on the long wall",
      notes: "Keeps the door swing clear.",
      status: "candidate",
    })
    const [latest] = await events(w.t, w.layoutId)
    expect(latest).toMatchObject({
      actor: "agent",
      revision: 0,
      summary:
        "Renamed 'Living' to 'Sofa on the long wall', updated the notes, marked as candidate",
    })
  })

  it("bumps the revision when the finishes override changes, and can remove it", async () => {
    const w = await world()
    const set = await w.t.run(async (ctx) =>
      doUpdateLayout(ctx, {
        layoutId: w.layoutId,
        finishes: { walls: "deep green" },
      })
    )
    expect(set.revision).toBe(1)
    expect((await getLayout(w.t, w.layoutId)).finishes).toEqual({
      walls: "deep green",
    })
    const cleared = await w.t.run(async (ctx) =>
      doUpdateLayout(ctx, { layoutId: w.layoutId, finishes: null })
    )
    expect(cleared.revision).toBe(2)
    expect(await getLayout(w.t, w.layoutId)).not.toHaveProperty("finishes")
    expect((await events(w.t, w.layoutId)).map((e) => e.summary)).toEqual([
      "Removed the finishes override",
      "Set the finishes override (walls)",
      "Created layout 'Living'",
    ])
  })

  it("clears notes with an empty string, and records nothing when nothing changed", async () => {
    const w = await world()
    await w.t.run(async (ctx) =>
      doUpdateLayout(ctx, { layoutId: w.layoutId, notes: "x" })
    )
    await w.t.run(async (ctx) =>
      doUpdateLayout(ctx, { layoutId: w.layoutId, notes: "" })
    )
    expect(await getLayout(w.t, w.layoutId)).not.toHaveProperty("notes")
    const before = (await events(w.t, w.layoutId)).length
    await w.t.run(async (ctx) =>
      doUpdateLayout(ctx, { layoutId: w.layoutId, name: "Living", notes: "" })
    )
    expect(await events(w.t, w.layoutId)).toHaveLength(before)
  })

  it("validates fields and the expected revision", async () => {
    const w = await world()
    await expectAppError(
      w.t.run(async (ctx) =>
        doUpdateLayout(ctx, { layoutId: w.layoutId, name: "   " })
      ),
      "INVALID_INPUT"
    )
    await expectAppError(
      w.t.run(async (ctx) =>
        doUpdateLayout(ctx, {
          layoutId: w.layoutId,
          name: "New",
          expectedRevision: 3,
        })
      ),
      "CONFLICT"
    )
  })
})

describe("doRelintLayout", () => {
  it("stores the fresh report and logs a system event when the counts change", async () => {
    const w = await world()
    lintSpy.mockReturnValue(ONE_ERROR)
    const report = await w.t.run(async (ctx) =>
      doRelintLayout(ctx, { layoutId: w.layoutId, cause: "D2 moved" })
    )
    expect(report).toEqual(ONE_ERROR)
    expect((await getLayout(w.t, w.layoutId)).lint).toEqual(ONE_ERROR)
    const [latest] = await events(w.t, w.layoutId)
    expect(latest).toMatchObject({
      actor: "system",
      revision: 0,
      changes: [],
      lintCounts: ONE_ERROR.counts,
      summary:
        "Re-checked after D2 moved: now 1 error, 0 warnings, 0 info (was 0 errors, 0 warnings, 0 info)",
    })
  })

  it("logs nothing when the counts are unchanged", async () => {
    const w = await world()
    await w.t.run(async (ctx) =>
      doRelintLayout(ctx, { layoutId: w.layoutId, cause: "nothing much" })
    )
    expect(await events(w.t, w.layoutId)).toHaveLength(1)
  })

  it("does nothing for a layout that no longer exists", async () => {
    const w = await world()
    await w.t.run(async (ctx) => doRemoveLayout(ctx, { layoutId: w.layoutId }))
    expect(
      await w.t.run(async (ctx) =>
        doRelintLayout(ctx, { layoutId: w.layoutId, cause: "x" })
      )
    ).toBeNull()
  })

  it("runs for every layout of a room after a room change", async () => {
    const w = await world()
    const other = await createLayout(w.t, w.roomId, "Other")
    await apply(w, [SOFA_AGAINST_W6])
    lintSpy.mockReturnValue(ONE_ERROR)
    await w.t.run(async (ctx) =>
      doApplyShellChanges(ctx, {
        roomId: w.roomId,
        ops: [{ op: "removeFeature", id: "OB1" }],
      })
    )
    await finishScheduled(w.t)
    for (const layoutId of [w.layoutId, other]) {
      expect((await getLayout(w.t, layoutId)).lint).toEqual(ONE_ERROR)
      const [latest] = await events(w.t, layoutId)
      expect(latest?.summary).toMatch(
        /^Re-checked after the room's features changed: now 1 error/
      )
    }
  })

  it("runs for layouts using an asset after the asset changes", async () => {
    const w = await world()
    const other = await createLayout(w.t, w.roomId, "No sofa")
    await apply(w, [SOFA_AGAINST_W6])
    lintSpy.mockReturnValue(ONE_ERROR)
    await w.t.run(async (ctx) =>
      doUpdateAsset(ctx, { assetId: w.sofa, description: "Boucle, cream" })
    )
    await finishScheduled(w.t)
    expect((await getLayout(w.t, w.layoutId)).lint).toEqual(ONE_ERROR)
    expect((await events(w.t, w.layoutId))[0]?.summary).toMatch(
      /^Re-checked after Test three-seat sofa was updated/
    )
    expect((await getLayout(w.t, other)).lint.counts.error).toBe(0)
  })

  it("can be scheduled for every layout at once", async () => {
    const w = await world()
    await createLayout(w.t, w.roomId, "Other")
    expect(await w.t.run(async (ctx) => doScheduleRelintAll(ctx))).toBe(2)
    await finishScheduled(w.t)
  })
})

describe("doListLayouts", () => {
  it("summarises each layout with lint counts, item count and price", async () => {
    const w = await world()
    await apply(w, [SOFA_AGAINST_W6, COFFEE_TABLE_IN_FRONT, RUG_UNDER_TABLE])
    const other = await createLayout(w.t, w.roomId, "Empty")
    const rows = await w.t.run(async (ctx) =>
      doListLayouts(ctx, { roomId: w.roomId })
    )
    expect(rows).toEqual([
      expect.objectContaining({
        _id: w.layoutId,
        name: "Living",
        status: "draft",
        revision: 1,
        lintCounts: { error: 0, warning: 0, info: 0 },
        placementCount: 3,
        price: {
          amount: 1548.5,
          currency: "GBP",
          mixedCurrencies: false,
          unpricedItems: 1,
        },
      }),
      expect.objectContaining({ _id: other, placementCount: 0 }),
    ])
  })
})

describe("bestLayout", () => {
  type Row = Parameters<typeof bestLayout>[0][number] & { name: string }
  const row = (
    name: string,
    status: Row["status"],
    error = 0,
    warning = 0,
    updatedAt = 0
  ): Row => ({
    name,
    status,
    updatedAt,
    lintCounts: { error, warning, info: 0 },
  })

  it("prefers favourite over candidate over draft, whatever the lint says", () => {
    expect(
      bestLayout([
        row("draft", "draft"),
        row("candidate", "candidate", 3),
        row("favourite", "favourite", 5),
      ])?.name
    ).toBe("favourite")
  })

  it("then the fewest errors, then the fewest warnings, then the newest", () => {
    expect(
      bestLayout([row("a", "draft", 2), row("b", "draft", 1, 9)])?.name
    ).toBe("b")
    expect(
      bestLayout([row("a", "draft", 1, 3), row("b", "draft", 1, 2)])?.name
    ).toBe("b")
    expect(
      bestLayout([row("old", "draft", 0, 0, 1), row("new", "draft", 0, 0, 2)])
        ?.name
    ).toBe("new")
  })

  it("never picks an archived layout", () => {
    expect(bestLayout([row("gone", "archived")])).toBeNull()
    expect(bestLayout([])).toBeNull()
  })
})

describe("layoutPrice", () => {
  it("flags mixed currencies instead of naming one", async () => {
    const w = await world()
    await w.t.run(async (ctx) =>
      doUpdateAsset(ctx, {
        assetId: w.rug,
        product: {
          url: "https://example.com/rug",
          price: 100,
          currency: "EUR",
          dimsSource: "listing",
        },
      })
    )
    await apply(w, [
      SOFA_AGAINST_W6,
      { ...RUG_UNDER_TABLE, position: { mode: "at", x: 1500, z: 3000 } },
    ])
    const price = await w.t.run(async (ctx) => {
      const layout = await ctx.db.get(w.layoutId)
      const docs = await Promise.all([ctx.db.get(w.sofa), ctx.db.get(w.rug)])
      const assets = new Map(
        docs.flatMap((d) => (d ? [[d._id, d] as const] : []))
      )
      return layoutPrice(layout?.placements ?? [], assets)
    })
    expect(price).toEqual({
      amount: 1399,
      currency: null,
      mixedCurrencies: true,
      unpricedItems: 0,
    })
  })
})

describe("doGetLayout", () => {
  it("returns placed assets, plain-English relations and the price", async () => {
    const w = await world()
    await apply(w, [SOFA_AGAINST_W6, COFFEE_TABLE_IN_FRONT])
    const photo = await fakeStorageId(w.t)
    await w.t.run(async (ctx) =>
      ctx.db.patch(w.sofa, { images: [{ storageId: photo, primary: true }] })
    )
    const layout = await w.t.run(async (ctx) =>
      doGetLayout(ctx, { layoutId: w.layoutId })
    )
    expect(Object.keys(layout?.assets ?? {}).sort()).toEqual(
      [w.sofa, w.coffeeTable].sort()
    )
    expect(layout?.assets[w.sofa]).toMatchObject({
      key: "test-sofa",
      name: "Test three-seat sofa",
      dims: { w: 2200, d: 950, h: 820 },
      primaryImageUrl: expect.stringContaining("/api/storage/"),
    })
    expect(layout?.assets[w.coffeeTable]?.primaryImageUrl).toBeNull()
    expect(layout?.relations.sofa).toMatchObject({
      nearestWall: { wall: "W6", gapMm: 18 },
      touchingWalls: ["W6"],
    })
    expect(layout?.relations.sofa?.facingDescription).toContain(
      "back against W6 (18mm off the plaster)"
    )
    expect(layout?.price.amount).toBe(1548.5)
  })

  it("returns null for a missing layout", async () => {
    const w = await world()
    await w.t.run(async (ctx) => doRemoveLayout(ctx, { layoutId: w.layoutId }))
    expect(
      await w.t.query(api.layouts.get, { layoutId: w.layoutId })
    ).toBeNull()
  })
})

describe("doRemoveLayout", () => {
  it("deletes the layout with its refs, events and renders", async () => {
    const w = await world()
    await apply(w, [SOFA_AGAINST_W6])
    const output = await fakeStorageId(w.t)
    const reference = await fakeStorageId(w.t)
    await w.t.run(async (ctx) =>
      ctx.db.insert("renders", {
        layoutId: w.layoutId,
        roomId: w.roomId,
        kind: "photoreal",
        status: "done",
        view: {
          id: "v",
          name: "View",
          position: [0, 1600, 0],
          target: [1, 1200, 1],
          fov: 50,
        },
        inputs: [{ role: "reference", storageId: reference }],
        output,
        layoutRevision: 1,
        layoutSnapshot: { placements: [] },
        createdAt: 0,
      })
    )
    await w.t.run(async (ctx) => doRemoveLayout(ctx, { layoutId: w.layoutId }))
    const left = await w.t.run(async (ctx) => ({
      refs: await ctx.db.query("layoutAssetRefs").collect(),
      events: await ctx.db.query("layoutEvents").collect(),
      renders: await ctx.db.query("renders").collect(),
      outputKept: (await ctx.storage.get(output)) !== null,
      referenceKept: (await ctx.storage.get(reference)) !== null,
    }))
    expect(left.refs).toEqual([])
    expect(left.events).toEqual([])
    expect(left.renders).toEqual([])
    expect(left.outputKept).toBe(false)
    // Product photos belong to the asset, not the render.
    expect(left.referenceKept).toBe(true)
  })
})

describe("doListEvents", () => {
  it("returns the newest events first, up to the limit", async () => {
    const w = await world()
    for (let i = 0; i < 3; i++) {
      await apply(w, [{ ...SOFA_AGAINST_W6, id: `sofa-${i}` }])
    }
    const latest = await w.t.run(async (ctx) =>
      doListEvents(ctx, { layoutId: w.layoutId, limit: 2 })
    )
    expect(latest.map((e) => e.revision)).toEqual([3, 2])
    const capped = await w.t.run(async (ctx) =>
      doListEvents(ctx, { layoutId: w.layoutId, limit: 1000 })
    )
    expect(capped).toHaveLength(4)
  })
})

describe("doRoomActivity", () => {
  it("gives each layout's latest event and the room's latest overall", async () => {
    vi.setSystemTime(new Date("2026-10-11T09:00:00Z"))
    const w = await world()
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"))
    const other = await createLayout(w.t, w.roomId, "Other")
    vi.setSystemTime(new Date("2026-10-11T10:05:00Z"))
    await apply(w, [SOFA_AGAINST_W6], { actor: "user" })
    vi.setSystemTime(new Date("2026-10-11T10:06:00Z"))
    await w.t.run(async (ctx) =>
      doUpdateLayout(ctx, {
        layoutId: other,
        status: "candidate",
        actor: "user",
      })
    )
    const activity = await w.t.run(async (ctx) =>
      doRoomActivity(ctx, { roomId: w.roomId })
    )
    expect(activity.layouts.map((l) => [l.name, l.latest?.summary])).toEqual([
      ["Living", expect.stringMatching(/^Added Test three-seat sofa/)],
      ["Other", "Marked as candidate"],
    ])
    expect(activity.latestAt).toBe(Date.parse("2026-10-11T10:06:00Z"))
    expect(activity.latest?.layoutId).toBe(other)
    // The newest agent event is Other's creation (createLayout acts as agent).
    expect(activity.latestAgentAt).toBe(Date.parse("2026-10-11T10:00:00Z"))
  })
})
