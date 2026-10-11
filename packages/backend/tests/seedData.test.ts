import { LIVING_ROOM_FEATURES, TEST_ASSETS } from "@roomer/core/fixtures"
import type { AddOp } from "@roomer/core/schema"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "../convex/_generated/api"
import {
  doReplaceAssetSpec,
  doSetImages,
  doSetPreviews,
} from "../convex/assets"
import {
  doApplyChanges,
  doCreateLayout,
  doUpdateLayout,
} from "../convex/layouts"
import { doApplyShellChanges } from "../convex/rooms"
import {
  doAssetsWithoutPreviews,
  doExportSeed,
  doImportLayouts,
  doImportSeed,
} from "../convex/seedData"
import { formatSeedFile, zSeedFile, type SeedFile } from "../convex/seedFile"
import {
  createLivingRoom,
  createTestAsset,
  createTestConvex,
  expectAppError,
  fakeStorageId,
  finishScheduled,
  type TestConvex,
} from "./setup"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const SOFA_AGAINST_W6: AddOp = {
  op: "add",
  id: "sofa",
  asset: "test-sofa",
  label: "Big sofa",
  position: { mode: "against", wall: "W6", at: 3700 },
}

/**
 * A deployment with real design data: the living room (with a camera of
 * its own), a photographed sofa, a rug, a candidate layout using both and an
 * archived one that shouldn't travel.
 */
async function designedDeployment(): Promise<TestConvex> {
  const t = createTestConvex()
  const roomId = await createLivingRoom(t)
  await t.run(async (ctx) =>
    doApplyShellChanges(ctx, {
      roomId,
      ops: [{ op: "setFinishes", finishes: { walls: "sage green" } }],
    })
  )
  await t.run(async (ctx) =>
    ctx.db.patch(roomId, {
      cameras: [
        {
          id: "sofa-view",
          name: "From the sofa",
          position: [600, 1100, 4000],
          target: [2900, 1100, 4000],
          fov: 55,
          projection: "fisheye",
        },
      ],
    })
  )
  const sofa = await createTestAsset(t, "sofa", { price: 1299 })
  await createTestAsset(t, "rug")
  const front = await fakeStorageId(t, "front")
  const side = await fakeStorageId(t, "side")
  const uploaded = await fakeStorageId(t, "uploaded")
  await t.run(async (ctx) =>
    doSetImages(ctx, {
      assetId: sofa,
      images: [
        {
          storageId: front,
          sourceUrl: "https://shop.test/front.jpg",
          primary: false,
        },
        {
          storageId: side,
          sourceUrl: "https://shop.test/side.jpg",
          primary: true,
        },
        // Uploaded directly: no URL, so it can't be exported.
        { storageId: uploaded, primary: false },
      ],
    })
  )
  const { layoutId } = await t.run(async (ctx) =>
    doCreateLayout(ctx, {
      roomId,
      name: "Sofa on the long wall",
      actor: "agent",
    })
  )
  await t.run(async (ctx) =>
    doApplyChanges(ctx, {
      layoutId,
      actor: "agent",
      ops: [
        SOFA_AGAINST_W6,
        {
          op: "add",
          id: "rug",
          asset: "test-rug",
          position: { mode: "centerOn", placement: "sofa", dx: 1200 },
          mirrored: true,
        },
      ],
    })
  )
  await t.run(async (ctx) =>
    doUpdateLayout(ctx, {
      layoutId,
      status: "candidate",
      notes: "Keeps D2's swing clear.",
      finishes: { floor: "dark oak" },
    })
  )
  const { layoutId: archived } = await t.run(async (ctx) =>
    doCreateLayout(ctx, { roomId, name: "Old idea", actor: "user" })
  )
  await t.run(async (ctx) =>
    doUpdateLayout(ctx, { layoutId: archived, status: "archived" })
  )
  await finishScheduled(t)
  return t
}

async function exportOf(t: TestConvex): Promise<SeedFile> {
  return await t.run(async (ctx) => doExportSeed(ctx))
}

async function counts(t: TestConvex) {
  return await t.run(async (ctx) => ({
    rooms: (await ctx.db.query("rooms").collect()).length,
    assets: (await ctx.db.query("assets").collect()).length,
    layouts: (await ctx.db.query("layouts").collect()).length,
    events: (await ctx.db.query("layoutEvents").collect()).length,
  }))
}

describe("doExportSeed", () => {
  it("writes rooms, assets and non-archived layouts by name and key", async () => {
    const t = await designedDeployment()
    const file = await exportOf(t)
    expect(zSeedFile.safeParse(file).success).toBe(true)
    expect(file.rooms.map((r) => r.name)).toEqual(["Living room"])
    expect(file.rooms[0]).toMatchObject({
      measurements: { kind: "walk" },
      features: LIVING_ROOM_FEATURES,
      cameras: [expect.objectContaining({ id: "sofa-view" })],
    })
    expect(file.rooms[0]?.finishes.walls).toBe("sage green")
    expect(file.assets.map((a) => a.key)).toEqual(["test-rug", "test-sofa"])
    const sofa = file.assets.find((a) => a.key === "test-sofa")
    expect(sofa).toMatchObject({
      source: "library",
      name: TEST_ASSETS.sofa.name,
      product: { price: 1299, currency: "GBP" },
      images: [
        { sourceUrl: "https://shop.test/front.jpg", primary: false },
        { sourceUrl: "https://shop.test/side.jpg", primary: true },
      ],
    })
    expect(file.layouts).toEqual([
      {
        room: "Living room",
        name: "Sofa on the long wall",
        status: "candidate",
        notes: "Keeps D2's swing clear.",
        finishes: { floor: "dark oak" },
        placements: [
          expect.objectContaining({
            id: "sofa",
            assetKey: "test-sofa",
            label: "Big sofa",
          }),
          expect.objectContaining({
            id: "rug",
            assetKey: "test-rug",
            mirrored: true,
          }),
        ],
      },
    ])
    expect(file.layouts[0]?.placements[0]).not.toHaveProperty("assetId")
  })
})

describe("formatSeedFile", () => {
  it("is deterministic, schema-ordered and keeps short arrays on one line", async () => {
    const t = await designedDeployment()
    const file = await exportOf(t)
    const text = formatSeedFile(file)
    expect(formatSeedFile(JSON.parse(text))).toBe(text)
    expect(JSON.parse(text)).toEqual(zSeedFile.parse(file))
    expect(text.endsWith("}\n")).toBe(true)
    expect(text).toContain('"position": [600, 1100, 4000]')
    // Keys follow the schema: key and source lead each asset.
    expect(text).toMatch(
      /\{\n {6}"key": "test-rug",\n {6}"source": "library",\n {6}"name"/
    )
  })

  it("rejects files whose references don't resolve, naming each problem", async () => {
    const t = await designedDeployment()
    const file = await exportOf(t)
    const broken = {
      ...file,
      assets: [...file.assets, file.assets[0]],
      layouts: [
        {
          ...file.layouts[0],
          room: "Kitchen",
          placements: [
            { ...file.layouts[0]!.placements[0], assetKey: "ghost-chair" },
            file.layouts[0]!.placements[0],
          ],
        },
      ],
    }
    const result = zSeedFile.safeParse(broken)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      "Two assets have the key 'test-rug'; keys must be unique.",
      "Layout 'Sofa on the long wall' is for room 'Kitchen', which isn't in the file.",
      "Layout 'Sofa on the long wall' has two placements with id 'sofa'.",
      "Layout 'Sofa on the long wall' places 'sofa' as asset 'ghost-chair', which isn't in the file.",
    ])
    expect(() => formatSeedFile(broken)).toThrow("ghost-chair")
  })
})

describe("doImportSeed", () => {
  it("recreates the exported data in an empty deployment", async () => {
    const source = await designedDeployment()
    const file = await exportOf(source)

    const t = createTestConvex()
    const result = await t.run(async (ctx) => doImportSeed(ctx, file))
    expect(result.rooms.map((r) => [r.name, r.status])).toEqual([
      ["Living room", "created"],
    ])
    expect(result.assets.map((a) => [a.key, a.status, a.needsImages])).toEqual([
      ["test-rug", "created", false],
      ["test-sofa", "created", true],
    ])
    expect(result.layouts.map((l) => [l.name, l.status])).toEqual([
      ["Sofa on the long wall", "created"],
    ])
    await finishScheduled(t)

    // Same data back out, except photos, which the script downloads later.
    const reexported = await exportOf(t)
    expect(reexported).toEqual({
      ...file,
      assets: file.assets.map((asset) => ({ ...asset, images: [] })),
    })

    // Placements point at the new deployment's assets, refs and lint kept.
    const layoutId = result.layouts[0]!.layoutId
    const layout = await t.query(api.layouts.get, { layoutId })
    expect(layout?.lint).toBeDefined()
    const sofaId = result.assets.find((a) => a.key === "test-sofa")!.assetId
    expect(layout?.placements[0]?.assetId).toBe(sofaId)
    expect(await t.query(api.assets.usage, { assetId: sofaId })).toEqual({
      layouts: [
        {
          layoutId,
          layoutName: "Sofa on the long wall",
          roomId: result.rooms[0]!.roomId,
          count: 1,
        },
      ],
    })
    // No previews yet: the web app renders them after the import.
    expect(
      (await t.run(async (ctx) => doAssetsWithoutPreviews(ctx))).map(
        (a) => a.key
      )
    ).toEqual(["test-rug", "test-sofa"])
  })

  it("is idempotent: importing the same file again changes nothing", async () => {
    const file = await exportOf(await designedDeployment())
    const t = createTestConvex()
    await t.run(async (ctx) => doImportSeed(ctx, file))
    await finishScheduled(t)
    const before = await counts(t)
    const again = await t.run(async (ctx) => doImportSeed(ctx, file))
    expect([
      ...again.rooms.map((r) => r.status),
      ...again.assets.map((a) => a.status),
      ...again.layouts.map((l) => l.status),
    ]).toEqual(["unchanged", "unchanged", "unchanged", "unchanged"])
    expect(again.rooms[0]?.changes).toEqual([])
    expect(await counts(t)).toEqual(before)
  })

  it("updates what changed in the file, in place", async () => {
    const file = await exportOf(await designedDeployment())
    const t = createTestConvex()
    const first = await t.run(async (ctx) => doImportSeed(ctx, file))
    await finishScheduled(t)
    const [room] = file.rooms
    const [layout] = file.layouts
    const changed: SeedFile = {
      ...file,
      rooms: [
        {
          ...room!,
          finishes: { walls: "warm white" },
          features: room!.features.filter((f) => f.id !== "S4"),
        },
      ],
      assets: file.assets.map((asset) =>
        asset.key === "test-rug"
          ? { ...asset, name: "Wool rug", tags: undefined }
          : asset
      ),
      layouts: [
        {
          ...layout!,
          status: "favourite",
          notes: undefined,
          placements: layout!.placements.slice(0, 1),
        },
      ],
    }
    const second = await t.run(async (ctx) => doImportSeed(ctx, changed))
    expect(second.rooms[0]).toMatchObject({
      roomId: first.rooms[0]!.roomId,
      status: "updated",
      changes: [
        "Removed socket S4",
        "Set the walls finish and cleared the floor, ceiling, skirting, notes finish",
      ],
    })
    expect(second.assets.map((a) => a.status)).toEqual(["updated", "unchanged"])
    expect(second.layouts[0]).toMatchObject({
      layoutId: first.layouts[0]!.layoutId,
      status: "updated",
    })
    await finishScheduled(t)
    const reexported = await exportOf(t)
    expect(reexported.rooms[0]?.finishes).toEqual({ walls: "warm white" })
    expect(reexported.assets[0]?.name).toBe("Wool rug")
    expect(reexported.layouts[0]).toMatchObject({ status: "favourite" })
    expect(reexported.layouts[0]).not.toHaveProperty("notes")
    expect(reexported.layouts[0]?.placements.map((p) => p.id)).toEqual(["sofa"])
  })

  it("fails clearly when a layout uses an asset key nobody has", async () => {
    const file = await exportOf(await designedDeployment())
    const t = createTestConvex()
    await t.run(async (ctx) => doImportSeed(ctx, { ...file, layouts: [] }))
    const [layout] = file.layouts
    await expectAppError(
      t.run(async (ctx) =>
        doImportLayouts(ctx, {
          layouts: [
            {
              ...layout!,
              placements: [
                { ...layout!.placements[0]!, assetKey: "ghost-chair" },
              ],
            },
          ],
        })
      ),
      "NOT_FOUND",
      "Layout 'Sofa on the long wall' in 'Living room': placement 'sofa' uses asset 'ghost-chair', but no asset has that key."
    )
    expect(
      await t.run(async (ctx) => ctx.db.query("layouts").collect())
    ).toEqual([])
  })

  it("names the asset when one in the file is invalid", async () => {
    const file = await exportOf(await designedDeployment())
    const t = createTestConvex()
    const [rug] = file.assets
    await expectAppError(
      t.run(async (ctx) =>
        doImportSeed(ctx, {
          ...file,
          assets: [{ ...rug!, dims: { ...rug!.dims, w: rug!.dims.w + 500 } }],
          layouts: [],
        })
      ),
      "INVALID_INPUT",
      "Asset 'test-rug': The model doesn't match its listing"
    )
  })
})

describe("doReplaceAssetSpec", () => {
  it("removes fields the new spec lacks and drops stale previews", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "sofa", { price: 10 })
    const preview = await fakeStorageId(t)
    await t.run(async (ctx) =>
      doSetPreviews(ctx, {
        assetId,
        previews: [{ view: "iso", storageId: preview }],
      })
    )
    const { product, ...withoutProduct } = TEST_ASSETS.sofa
    void product
    const renamed = await t.run(async (ctx) =>
      doReplaceAssetSpec(ctx, {
        assetId,
        spec: { ...withoutProduct, name: "Sofa" },
        source: "custom",
      })
    )
    expect(renamed).toMatchObject({ changed: true, previewsCleared: false })
    const asset = await t.run(async (ctx) => ctx.db.get(assetId))
    expect(asset).not.toHaveProperty("product")
    expect(asset?.source).toBe("custom")
    expect(asset?.previews).toHaveLength(1)

    const reshaped = await t.run(async (ctx) =>
      doReplaceAssetSpec(ctx, {
        assetId,
        spec: { ...TEST_ASSETS.coffeeTable, name: "Sofa" },
        source: "custom",
      })
    )
    expect(reshaped.previewsCleared).toBe(true)
    expect((await t.run(async (ctx) => ctx.db.get(assetId)))?.previews).toEqual(
      []
    )
    expect(await t.run(async (ctx) => ctx.storage.get(preview))).toBeNull()
    await finishScheduled(t)
  })
})
