import { COFFEE_TABLE, RUG, SOFA, TEST_ASSETS } from "@roomer/core/fixtures"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api } from "../convex/_generated/api"
import type { Id } from "../convex/_generated/dataModel"
import {
  doAttachImages,
  doCreateAsset,
  doGetAsset,
  doGetAssetByKey,
  doListAssets,
  doRemoveAsset,
  doSearchAssets,
  doSetImages,
  doSetPreviews,
  doUpdateAsset,
  downloadImage,
  DESKTOP_USER_AGENT,
  IMAGE_FETCH_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
} from "../convex/assets"
import { doApplyChanges } from "../convex/layouts"
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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function getAsset(t: TestConvex, assetId: Id<"assets">) {
  const asset = await t.run(async (ctx) => ctx.db.get(assetId))
  if (!asset) throw new Error("asset missing")
  return asset
}

/** A fetch double answering every URL with `respond(url)`. */
function fakeFetch(respond: (url: string) => Response): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) =>
    respond(input instanceof Request ? input.url : String(input))
  )
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
const image = (type = "image/png") =>
  new Response(PNG, { headers: { "content-type": type } })

describe("doCreateAsset", () => {
  it("stores the spec with its key, source and empty photos", async () => {
    const t = createTestConvex()
    const result = await t.run(async (ctx) =>
      doCreateAsset(ctx, { ...COFFEE_TABLE, key: "lack-coffee-table" })
    )
    expect(result.key).toBe("lack-coffee-table")
    expect(result.warnings).toEqual([])
    expect(result.bounds).toEqual({
      min: [-550, 0, -300],
      max: [550, 420, 300],
    })
    const asset = await getAsset(t, result.assetId)
    expect(asset).toMatchObject({
      ...COFFEE_TABLE,
      key: "lack-coffee-table",
      source: "custom",
      images: [],
      previews: [],
    })
  })

  it("derives a unique key from the name when none is given", async () => {
    const t = createTestConvex()
    const first = await t.run(async (ctx) => doCreateAsset(ctx, SOFA))
    const second = await t.run(async (ctx) => doCreateAsset(ctx, SOFA))
    expect(first.key).toBe("test-three-seat-sofa")
    expect(second.key).toBe("test-three-seat-sofa-2")
  })

  it("refuses a key that's taken, with CONFLICT", async () => {
    const t = createTestConvex()
    await t.run(async (ctx) => doCreateAsset(ctx, { ...SOFA, key: "sofa" }))
    await expectAppError(
      t.run(async (ctx) => doCreateAsset(ctx, { ...RUG, key: "sofa" })),
      "CONFLICT",
      "An asset with key 'sofa' already exists (Test three-seat sofa"
    )
  })

  it("lists every model problem when the parts don't match the dims", async () => {
    const t = createTestConvex()
    const error = await expectAppError(
      t.run(async (ctx) =>
        doCreateAsset(ctx, {
          ...COFFEE_TABLE,
          dims: { w: 1200, d: 600, h: 500 },
        })
      ),
      "INVALID_INPUT",
      "The model doesn't match its listing: 2 problems."
    )
    expect(error.issues?.map((i) => i.path)).toEqual(["geometry", "geometry"])
    expect(error.issues?.[0]?.message).toContain(
      "Parts span 1,100mm wide (x -550 to 550) but dims.w is 1,200mm (100mm short)"
    )
    expect(error.issues?.[1]?.message).toContain("dims.h is 500mm")
  })

  it("rejects malformed fields with zod paths, and bad keys", async () => {
    const t = createTestConvex()
    const error = await expectAppError(
      t.run(async (ctx) =>
        doCreateAsset(ctx, { ...COFFEE_TABLE, dims: { w: 0, d: 600, h: 420 } })
      ),
      "INVALID_INPUT"
    )
    expect(error.issues?.map((i) => i.path)).toEqual(["dims.w"])
    const keyError = await expectAppError(
      t.run(async (ctx) =>
        doCreateAsset(ctx, { ...COFFEE_TABLE, key: "Coffee Table" })
      ),
      "INVALID_INPUT"
    )
    expect(keyError.issues?.[0]?.path).toBe("key")
  })

  it("returns validation warnings without rejecting", async () => {
    const t = createTestConvex()
    const [top, ...legs] = COFFEE_TABLE.geometry.parts
    const result = await t.run(async (ctx) =>
      doCreateAsset(ctx, {
        ...COFFEE_TABLE,
        geometry: {
          kind: "parts",
          parts: [top!, ...legs.map((leg) => ({ ...leg, name: "leg" }))],
        },
      })
    )
    expect(result.warnings).toEqual([
      expect.stringContaining("4 parts are called 'leg'"),
    ])
  })
})

describe("doUpdateAsset", () => {
  it("merges the given fields and re-validates", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "coffeeTable")
    await t.run(async (ctx) =>
      doUpdateAsset(ctx, { assetId, name: "Lack coffee table", tags: ["ikea"] })
    )
    const asset = await getAsset(t, assetId)
    expect(asset.name).toBe("Lack coffee table")
    expect(asset.tags).toEqual(["ikea"])
    expect(asset.dims).toEqual(COFFEE_TABLE.dims)

    await expectAppError(
      t.run(async (ctx) =>
        doUpdateAsset(ctx, { assetId, dims: { w: 900, d: 600, h: 420 } })
      ),
      "INVALID_INPUT",
      "dims.w is 900mm"
    )
    expect((await getAsset(t, assetId)).dims).toEqual(COFFEE_TABLE.dims)
  })

  it("refuses an update with nothing in it", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "rug")
    await expectAppError(
      t.run(async (ctx) => doUpdateAsset(ctx, { assetId })),
      "INVALID_INPUT",
      "Nothing to update"
    )
  })

  it("re-lints every layout that places the asset", async () => {
    vi.useFakeTimers()
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const rug = await createTestAsset(t, "rug")
    const used = await createLayout(t, roomId, "Uses the rug")
    await createLayout(t, roomId, "Empty") // places nothing: not re-linted
    await t.run(async (ctx) =>
      doApplyChanges(ctx, {
        layoutId: used,
        actor: "agent",
        ops: [
          {
            op: "add",
            asset: "test-rug",
            position: { mode: "at", x: 1500, z: 3000 },
          },
          {
            op: "add",
            asset: "test-rug",
            position: { mode: "at", x: 1500, z: 5000 },
          },
        ],
      })
    )
    const result = await t.run(async (ctx) =>
      doUpdateAsset(ctx, { assetId: rug, name: "Wool rug" })
    )
    // One re-lint per layout, however many times the asset is placed.
    expect(result.relintedLayouts).toBe(1)
    const jobs = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    )
    expect(jobs.map((job) => job.args[0])).toEqual([
      { layoutId: used, cause: "Wool rug was updated" },
    ])
    await finishScheduled(t)
  })
})

describe("doSetImages", () => {
  it("makes the first photo primary when none is chosen", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "sofa")
    const a = await fakeStorageId(t, "a")
    const b = await fakeStorageId(t, "b")
    const { images } = await t.run(async (ctx) =>
      doSetImages(ctx, {
        assetId,
        images: [
          { storageId: a, primary: false },
          { storageId: b, primary: false, sourceUrl: "https://x.test/b.jpg" },
        ],
      })
    )
    expect(images.map((i) => i.primary)).toEqual([true, false])
    expect((await getAsset(t, assetId)).images).toEqual(images)
  })

  it("refuses two primaries, more than three photos and missing files", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "sofa")
    const ids = await Promise.all(
      ["a", "b", "c", "d"].map((c) => fakeStorageId(t, c))
    )
    await expectAppError(
      t.run(async (ctx) =>
        doSetImages(ctx, {
          assetId,
          images: ids
            .slice(0, 2)
            .map((storageId) => ({ storageId, primary: true })),
        })
      ),
      "INVALID_INPUT",
      "2 photos are marked primary; mark exactly one."
    )
    await expectAppError(
      t.run(async (ctx) =>
        doSetImages(ctx, {
          assetId,
          images: ids.map((storageId) => ({ storageId, primary: false })),
        })
      ),
      "INVALID_INPUT"
    )
    await t.run(async (ctx) => ctx.storage.delete(ids[0]!))
    await expectAppError(
      t.run(async (ctx) =>
        doSetImages(ctx, {
          assetId,
          images: [{ storageId: ids[0]!, primary: true }],
        })
      ),
      "NOT_FOUND"
    )
  })
})

describe("doSetPreviews", () => {
  it("replaces the previews, one per view", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "sofa")
    const front = await fakeStorageId(t, "front")
    const iso = await fakeStorageId(t, "iso")
    await t.run(async (ctx) =>
      doSetPreviews(ctx, {
        assetId,
        previews: [
          { view: "front", storageId: front },
          { view: "iso", storageId: iso },
        ],
      })
    )
    const detail = await t.run(async (ctx) => doGetAsset(ctx, { assetId }))
    expect(detail?.previewUrls.map((p) => p.view)).toEqual(["front", "iso"])
    await expectAppError(
      t.run(async (ctx) =>
        doSetPreviews(ctx, {
          assetId,
          previews: [
            { view: "iso", storageId: front },
            { view: "iso", storageId: iso },
          ],
        })
      ),
      "INVALID_INPUT",
      "Each view may have one preview; iso appears more than once."
    )
  })
})

describe("doRemoveAsset", () => {
  it("refuses to delete an asset placed in a layout, naming the layout", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const assetId = await createTestAsset(t, "rug")
    const layoutId = await createLayout(t, roomId, "Cosy")
    await t.run(async (ctx) =>
      doApplyChanges(ctx, {
        layoutId,
        actor: "agent",
        ops: [
          {
            op: "add",
            asset: assetId,
            position: { mode: "at", x: 1500, z: 3000 },
          },
        ],
      })
    )
    await expectAppError(
      t.run(async (ctx) => doRemoveAsset(ctx, { assetId })),
      "CONFLICT",
      "Test rug is placed in 1 layout ('Cosy'). Remove or swap it there first."
    )
  })

  it("deletes an unused asset and its previews", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "rug")
    const preview = await fakeStorageId(t)
    await t.run(async (ctx) =>
      doSetPreviews(ctx, {
        assetId,
        previews: [{ view: "top", storageId: preview }],
      })
    )
    await t.run(async (ctx) => doRemoveAsset(ctx, { assetId }))
    expect(await t.run(async (ctx) => ctx.db.get(assetId))).toBeNull()
    expect(await t.run(async (ctx) => ctx.storage.get(preview))).toBeNull()
  })
})

describe("doListAssets", () => {
  it("lists by name, filtered by category and/or source", async () => {
    const t = createTestConvex()
    for (const name of Object.keys(
      TEST_ASSETS
    ) as (keyof typeof TEST_ASSETS)[]) {
      await createTestAsset(t, name)
    }
    await t.run(async (ctx) =>
      doCreateAsset(ctx, { ...TEST_ASSETS.diningChair, name: "Aalto chair" })
    )
    const names = async (args: Parameters<typeof doListAssets>[1]) =>
      (await t.run(async (ctx) => doListAssets(ctx, args))).map((a) => a.name)

    expect(await names({})).toEqual([
      "Aalto chair",
      "Test 65in TV",
      "Test coffee table",
      "Test dining chair",
      "Test dining table",
      "Test pendant lamp",
      "Test rug",
      "Test sideboard",
      "Test three-seat sofa",
    ])
    expect(await names({ category: "chair" })).toEqual([
      "Aalto chair",
      "Test dining chair",
    ])
    expect(await names({ source: "custom" })).toEqual(["Aalto chair"])
    expect(await names({ source: "library", category: "chair" })).toEqual([
      "Test dining chair",
    ])
    expect(await names({ source: "library" })).toHaveLength(8)
  })

  it("leaves geometry out of list rows", async () => {
    const t = createTestConvex()
    await createTestAsset(t, "sofa")
    const [row] = await t.run(async (ctx) => doListAssets(ctx, {}))
    expect(row).not.toHaveProperty("geometry")
    expect(row?.partCount).toBe(SOFA.geometry.parts.length)
  })
})

describe("doSearchAssets", () => {
  it("finds assets by name and falls back to the listing for an empty query", async () => {
    const t = createTestConvex()
    await createTestAsset(t, "sofa")
    await createTestAsset(t, "diningTable")
    await createTestAsset(t, "coffeeTable")
    const found = await t.run(async (ctx) =>
      doSearchAssets(ctx, { query: "table" })
    )
    expect(found.map((a) => a.name).sort()).toEqual([
      "Test coffee table",
      "Test dining table",
    ])
    const sofas = await t.run(async (ctx) =>
      doSearchAssets(ctx, { query: "table", category: "sofa" })
    )
    expect(sofas).toEqual([])
    const all = await t.run(async (ctx) => doSearchAssets(ctx, { query: " " }))
    expect(all).toHaveLength(3)
  })
})

describe("doGetAssetByKey", () => {
  it("returns the asset with photo URLs, or null", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "sofa")
    const photo = await fakeStorageId(t)
    await t.run(async (ctx) =>
      doSetImages(ctx, {
        assetId,
        images: [{ storageId: photo, primary: true }],
      })
    )
    const asset = await t.run(async (ctx) =>
      doGetAssetByKey(ctx, { key: "test-sofa" })
    )
    expect(asset?._id).toBe(assetId)
    expect(asset?.primaryImageUrl).toContain("/api/storage/")
    expect(asset?.imageUrls).toEqual([
      { storageId: photo, primary: true, url: asset?.primaryImageUrl },
    ])
    expect(
      await t.run(async (ctx) => doGetAssetByKey(ctx, { key: "nope" }))
    ).toBeNull()
  })
})

describe("downloadImage", () => {
  it("sends a desktop browser user agent and returns the image", async () => {
    const fetchImpl = fakeFetch(() => image("image/jpeg"))
    const result = await downloadImage("https://shop.test/a.jpg", fetchImpl)
    expect(result.ok && result.blob.type).toBe("image/jpeg")
    const init = vi.mocked(fetchImpl).mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get("user-agent")).toBe(
      DESKTOP_USER_AGENT
    )
  })

  it("refuses non-http URLs without fetching", async () => {
    const fetchImpl = fakeFetch(() => image())
    expect(await downloadImage("file:///etc/passwd", fetchImpl)).toEqual({
      ok: false,
      error: "Only http(s) URLs can be downloaded.",
    })
    expect(await downloadImage("not a url", fetchImpl)).toEqual({
      ok: false,
      error: "Not a valid URL.",
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("reports HTTP errors, non-images and oversized files", async () => {
    expect(
      await downloadImage(
        "https://shop.test/a.jpg",
        fakeFetch(() => new Response("no", { status: 403 }))
      )
    ).toMatchObject({ ok: false, error: expect.stringContaining("HTTP 403") })
    expect(
      await downloadImage(
        "https://shop.test/page",
        fakeFetch(() => image("text/html"))
      )
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("Not an image (content type 'text/html')"),
    })
    expect(
      await downloadImage(
        "https://shop.test/huge.png",
        fakeFetch(
          () =>
            new Response(PNG, {
              headers: {
                "content-type": "image/png",
                "content-length": String(MAX_IMAGE_BYTES + 1),
              },
            })
        )
      )
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("the limit is 10MB"),
    })
  })

  it("gives up after the timeout", async () => {
    vi.useFakeTimers()
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        )
      })
    const pending = downloadImage("https://slow.test/a.png", hanging)
    await vi.advanceTimersByTimeAsync(IMAGE_FETCH_TIMEOUT_MS)
    expect(await pending).toEqual({ ok: false, error: "Timed out after 15s." })
  })
})

describe("assets.addImagesFromUrls", () => {
  it("downloads each URL, reports failures and attaches the rest", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch((url) =>
        url.includes("broken") ? new Response("gone", { status: 404 }) : image()
      )
    )
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "sofa")
    const result = await t.action(api.assets.addImagesFromUrls, {
      assetId,
      urls: [
        "https://shop.test/front.png",
        "https://shop.test/broken.png",
        "https://shop.test/side.png",
      ],
      primaryIndex: 2,
    })
    expect(result.results.map((r) => r.ok)).toEqual([true, false, true])
    expect(result.images).toEqual([
      expect.objectContaining({
        sourceUrl: "https://shop.test/front.png",
        primary: false,
      }),
      expect.objectContaining({
        sourceUrl: "https://shop.test/side.png",
        primary: true,
      }),
    ])
    expect((await getAsset(t, assetId)).images).toEqual(result.images)
  })

  it("refuses more photos than an asset can hold unless replacing", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch(() => image())
    )
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "sofa")
    const urls = ["https://a.test/1.png", "https://a.test/2.png"]
    await t.action(api.assets.addImagesFromUrls, { assetId, urls })
    await expect(
      t.action(api.assets.addImagesFromUrls, { assetId, urls })
    ).rejects.toThrow("Pass replace: true to replace them.")
    const replaced = await t.action(api.assets.addImagesFromUrls, {
      assetId,
      urls,
      replace: true,
      primaryIndex: 1,
    })
    expect(replaced.images.map((i) => i.primary)).toEqual([false, true])
  })

  it("checks the URL count and primaryIndex", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "sofa")
    await expect(
      t.action(api.assets.addImagesFromUrls, { assetId, urls: [] })
    ).rejects.toThrow("Give between 1 and 3 image URLs (got 0).")
    await expect(
      t.action(api.assets.addImagesFromUrls, {
        assetId,
        urls: ["https://a.test/1.png"],
        primaryIndex: 1,
      })
    ).rejects.toThrow("primaryIndex 1 doesn't point at one of the 1 URLs")
  })
})

describe("doAttachImages", () => {
  it("hands primary to a new primary photo", async () => {
    const t = createTestConvex()
    const assetId = await createTestAsset(t, "sofa")
    const old = await fakeStorageId(t, "old")
    const fresh = await fakeStorageId(t, "new")
    await t.run(async (ctx) =>
      doSetImages(ctx, { assetId, images: [{ storageId: old, primary: true }] })
    )
    const images = await t.run(async (ctx) =>
      doAttachImages(ctx, {
        assetId,
        images: [{ storageId: fresh, primary: true }],
        replace: false,
      })
    )
    expect(images).toEqual([
      { storageId: old, primary: false },
      { storageId: fresh, primary: true },
    ])
  })
})
