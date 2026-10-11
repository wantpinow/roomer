import { COFFEE_TABLE } from "@roomer/core/fixtures"
import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"

import {
  assetDetail,
  fakeDeps,
  imagesOf,
  LAYOUT_ID,
  ROOM_ID,
  SOFA_ID,
  storageId,
  TABLE_ID,
  textOf,
} from "../../tests/fakes"
import {
  addAssetImages,
  createAsset,
  deleteAsset,
  getAsset,
  previewAsset,
  searchAssets,
  updateAsset,
} from "../assets"

describe("search_assets", () => {
  it("passes text, category and source to the backend", async () => {
    const deps = fakeDeps()
    const result = await searchAssets.call(
      { query: "sofa", category: "sofa", source: "library" },
      deps
    )
    expect(deps.api.assets.search).toHaveBeenCalledWith({
      query: "sofa",
      category: "sofa",
      source: "library",
      limit: 30,
    })
    expect(textOf(result)).toContain("- generic-sofa ·")
  })

  it("filters by maximum size after fetching a wider page", async () => {
    const deps = fakeDeps()
    const result = await searchAssets.call({ maxWidth: 2100, limit: 1 }, deps)
    expect(deps.api.assets.search).toHaveBeenCalledWith({
      query: "",
      limit: 100,
    })
    const text = textOf(result)
    expect(text).not.toContain("generic-sofa")
    expect(text).toContain("(showing 1 of 2; raise limit to see more)")
    expect(result.structuredContent).toMatchObject({ total: 2 })
  })
})

describe("get_asset", () => {
  it("finds an asset by key", async () => {
    const deps = fakeDeps()
    const result = await getAsset.call({ asset: "generic-coffee-table" }, deps)
    expect(textOf(result)).toContain(
      'Asset "Generic coffee table" — key generic-coffee-table'
    )
    expect(imagesOf(result)).toBe(0)
  })

  it("falls back to the id and ignores ids of other tables", async () => {
    const deps = fakeDeps()
    const byId = await getAsset.call({ asset: TABLE_ID }, deps)
    expect(byId.isError).toBeUndefined()
    deps.api.assets.get.mockRejectedValueOnce(
      new Error(
        'ArgumentValidationError: Found ID "x" from table `rooms`, which does not match the table name in validator `v.id("assets")`.'
      )
    )
    const wrong = await getAsset.call(
      { asset: "room00000000000000000000000001" },
      deps
    )
    expect(wrong.isError).toBe(true)
    expect(textOf(wrong)).toBe(
      "Error NOT_FOUND: There's no asset with key or id 'room00000000000000000000000001'. Find assets with search_assets."
    )
  })

  it("adds the stored previews and the parts JSON on request", async () => {
    const deps = fakeDeps()
    deps.api.assets.getByKey.mockResolvedValueOnce({
      ...assetDetail(SOFA_ID),
      previewUrls: [
        { view: "front", url: "http://127.0.0.1:3210/api/storage/f" },
        { view: "side", url: null },
      ],
    })
    const result = await getAsset.call(
      { asset: "generic-sofa", includePreviews: true, includeParts: true },
      deps
    )
    expect(imagesOf(result)).toBe(1)
    expect(textOf(result)).toContain("Parts JSON:")
  })
})

const MORI = {
  name: "Mori Coffee Table",
  category: "table",
  mount: "floor",
  dims: { w: 1200, d: 600, h: 313 },
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "box",
        name: "top",
        position: [0, 291, 0],
        size: [1200, 44, 600],
      },
      {
        shape: "box",
        name: "leg left",
        position: [-370, 135, 0],
        size: [60, 270, 600],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg right",
        position: [370, 135, 0],
        size: [60, 270, 600],
        tone: "dark",
      },
    ],
  },
}

describe("create_asset", () => {
  it("saves the asset, stores four previews and returns them", async () => {
    const deps = fakeDeps()
    const result = await createAsset.call(
      {
        key: "castlery-mori-coffee-table",
        spec: MORI,
        imageUrls: ["https://x.test/front.jpg", "https://x.test/angle.jpg"],
        primaryIndex: 1,
      },
      deps
    )
    expect(result.isError).toBeUndefined()
    expect(deps.api.assets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "castlery-mori-coffee-table",
        name: "Mori Coffee Table",
      })
    )
    expect(deps.renderer.renderAssetPreviews).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mori Coffee Table" }),
      ["front", "side", "top", "iso"]
    )
    expect(deps.api.assets.setPreviews).toHaveBeenCalledWith({
      assetId: SOFA_ID,
      previews: [
        { view: "front", storageId: storageId(1) },
        { view: "side", storageId: storageId(2) },
        { view: "top", storageId: storageId(3) },
        { view: "iso", storageId: storageId(4) },
      ],
    })
    expect(deps.api.assets.addImagesFromUrls).toHaveBeenCalledWith({
      assetId: SOFA_ID,
      urls: ["https://x.test/front.jpg", "https://x.test/angle.jpg"],
      primaryIndex: 1,
    })
    expect(imagesOf(result)).toBe(4)
    const text = textOf(result)
    expect(text).toContain(
      'Created asset "Mori Coffee Table" — key castlery-mori-coffee-table'
    )
    expect(text).toContain("matches the listed dims")
    expect(text).toContain("Images, in order: 1. front")
    expect(result.structuredContent).toMatchObject({
      imageNames: [
        "castlery-mori-coffee-table-front",
        "castlery-mori-coffee-table-side",
        "castlery-mori-coffee-table-top",
        "castlery-mori-coffee-table-iso",
      ],
    })
  })

  it("adds a comparison sheet when the saved photos come back", async () => {
    const deps = fakeDeps()
    deps.api.assets.get.mockResolvedValueOnce(assetDetail(TABLE_ID))
    const result = await createAsset.call(
      { spec: MORI, imageUrls: ["https://x.test/front.jpg"] },
      deps
    )
    expect(imagesOf(result)).toBe(5)
    expect(textOf(result)).toContain("5. comparison sheet")
  })

  it("returns only top and iso (and the sheet) for a rug", async () => {
    const deps = fakeDeps()
    const result = await createAsset.call(
      {
        spec: {
          ...MORI,
          name: "Flat rug",
          category: "rug",
          mount: "floor-covering",
          dims: { w: 1200, d: 600, h: 10 },
          geometry: {
            kind: "parts",
            parts: [
              {
                shape: "box",
                name: "rug",
                position: [0, 5, 0],
                size: [1200, 10, 600],
              },
            ],
          },
        },
      },
      deps
    )
    expect(imagesOf(result)).toBe(2)
    expect(textOf(result)).toContain("1. top (plan")
    // All four are still stored for the library.
    expect(
      deps.api.assets.setPreviews.mock.calls[0]?.[0].previews
    ).toHaveLength(4)
  })

  it("validates and renders without saving on a dry run", async () => {
    const deps = fakeDeps()
    const result = await createAsset.call(
      {
        spec: MORI,
        imageUrls: ["https://x.test/front.webp"],
        dryRun: true,
      },
      deps
    )
    expect(result.isError).toBeUndefined()
    expect(deps.api.assets.create).not.toHaveBeenCalled()
    expect(deps.api.files.upload).not.toHaveBeenCalled()
    expect(deps.api.assets.setPreviews).not.toHaveBeenCalled()
    expect(deps.api.assets.addImagesFromUrls).not.toHaveBeenCalled()
    expect(deps.api.files.download).toHaveBeenCalledWith(
      "https://x.test/front.webp"
    )
    // Previews plus the sheet built from the (downloaded, not stored) photo.
    expect(imagesOf(result)).toBe(5)
    const text = textOf(result)
    expect(text).toContain(
      'Dry run — nothing was saved. "Mori Coffee Table" is valid and would be created as key mori-coffee-table.'
    )
    expect(text).toContain("matches the listed dims")
    expect(result.structuredContent).toMatchObject({
      dryRun: true,
      key: "mori-coffee-table",
    })
  })

  it("lists every problem on its own line in a failed dry run", async () => {
    const deps = fakeDeps()
    const result = await createAsset.call(
      { spec: { ...MORI, dims: { w: 1300, d: 600, h: 400 } }, dryRun: true },
      deps
    )
    expect(result.isError).toBe(true)
    const lines = textOf(result).split("\n")
    expect(lines[0]).toBe(
      "Error INVALID_INPUT: The model doesn't match its listing: 2 problems (dry run — nothing was saved)."
    )
    expect(lines[1]).toMatch(/^- Parts span 1,200mm wide/)
    expect(lines[2]).toMatch(/^- Parts span 313mm high/)
    expect(deps.renderer.renderAssetPreviews).not.toHaveBeenCalled()
  })

  it("says a dry run's key is taken, as the real create would", async () => {
    const deps = fakeDeps()
    const result = await createAsset.call(
      { key: "generic-sofa", spec: MORI, dryRun: true },
      deps
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(
      "Error CONFLICT: An asset with key 'generic-sofa' already exists"
    )
  })

  it("puts several backend problems on separate lines", async () => {
    const deps = fakeDeps()
    deps.api.assets.create.mockRejectedValueOnce(
      new ConvexError({
        code: "INVALID_INPUT",
        message:
          "The model doesn't match its listing: 2 problems. geometry: A is wrong. geometry: B is wrong.",
        issues: [
          { path: "geometry", message: "A is wrong." },
          { path: "geometry", message: "B is wrong." },
        ],
      })
    )
    const result = await createAsset.call({ spec: MORI }, deps)
    expect(textOf(result)).toBe(
      [
        "Error INVALID_INPUT: The model doesn't match its listing: 2 problems.",
        "- geometry: A is wrong.",
        "- geometry: B is wrong.",
      ].join("\n")
    )
  })

  it("returns the backend's validation errors verbatim", async () => {
    const deps = fakeDeps()
    const message =
      "The model doesn't match its listing: 1 problem. geometry: The parts are 1,200mm wide but dims.w is 1,300mm (100mm too narrow)."
    deps.api.assets.create.mockRejectedValueOnce(
      new ConvexError({ code: "INVALID_INPUT", message })
    )
    const result = await createAsset.call({ spec: MORI }, deps)
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(`Error INVALID_INPUT: ${message}`)
    expect(deps.renderer.renderAssetPreviews).not.toHaveBeenCalled()
  })

  it("keeps the asset when previews fail and says how to retry", async () => {
    const deps = fakeDeps()
    deps.renderer.renderAssetPreviews.mockRejectedValueOnce(
      new Error("renderer down")
    )
    const result = await createAsset.call({ spec: MORI }, deps)
    expect(result.isError).toBeUndefined()
    expect(textOf(result)).toContain(
      "previews failed: renderer down Retry with preview_asset."
    )
    expect(textOf(result)).toContain("Photos: none yet")
  })

  it("names the exact field of a bad part", async () => {
    const deps = fakeDeps()
    const result = await createAsset.call(
      {
        spec: {
          ...MORI,
          geometry: {
            kind: "parts",
            parts: [
              MORI.geometry.parts[0],
              { shape: "box", name: "leg", position: [0, 135, 0] },
              { shape: "cone", name: "lamp", position: [0, 0, 0] },
            ],
          },
        },
      },
      deps
    )
    expect(textOf(result)).toBe(
      [
        "Error INVALID_INPUT: Invalid input (2 problems):",
        "- spec.geometry.parts[1].size: Invalid input: expected tuple, received undefined",
        "- spec.geometry.parts[2].shape: Invalid discriminator value. Expected 'box' | 'roundedBox' | 'cylinder' | 'sphere' | 'capsule' | 'torus' | 'extrude' | 'lathe'",
      ].join("\n")
    )
    expect(deps.api.assets.create).not.toHaveBeenCalled()
  })

  it("rejects a spec the schema refuses before calling the backend", async () => {
    const deps = fakeDeps()
    const result = await createAsset.call(
      { spec: { ...MORI, dims: { w: 1200.5, d: 600, h: 313 } } },
      deps
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("spec.dims.w")
    expect(deps.api.assets.create).not.toHaveBeenCalled()
  })
})

describe("update_asset", () => {
  it("re-renders previews when the geometry changes", async () => {
    const deps = fakeDeps()
    const result = await updateAsset.call(
      {
        asset: "generic-coffee-table",
        spec: { geometry: COFFEE_TABLE.geometry },
      },
      deps
    )
    expect(deps.api.assets.update).toHaveBeenCalledWith({
      assetId: TABLE_ID,
      geometry: COFFEE_TABLE.geometry,
    })
    // Four previews plus the comparison sheet (the table has a photo).
    expect(imagesOf(result)).toBe(5)
    expect(result.structuredContent).toMatchObject({
      imageNames: [
        "generic-coffee-table-front",
        "generic-coffee-table-side",
        "generic-coffee-table-top",
        "generic-coffee-table-iso",
        "generic-coffee-table-comparison",
      ],
    })
    expect(deps.api.files.download).toHaveBeenCalledWith(
      "http://127.0.0.1:3210/api/storage/table"
    )
    const text = textOf(result)
    expect(text).toContain("Re-linting the layout that uses it.")
    expect(text).toContain(
      "5. comparison sheet: the product photo beside the clay front and iso"
    )
    expect(text).toContain("Top and iso carry an orientation marker")
  })

  it("skips previews for a non-visual change and needs at least one field", async () => {
    const deps = fakeDeps()
    const result = await updateAsset.call(
      { asset: "generic-sofa", spec: { description: "Cream boucle" } },
      deps
    )
    expect(imagesOf(result)).toBe(0)
    expect(deps.renderer.renderAssetPreviews).not.toHaveBeenCalled()
    const empty = await updateAsset.call(
      { asset: "generic-sofa", spec: {} },
      deps
    )
    expect(empty.isError).toBe(true)
    expect(textOf(empty)).toContain("Pass at least one field to change")
  })
})

describe("update_asset dry run", () => {
  it("renders the merged spec with the stored photos, saving nothing", async () => {
    const deps = fakeDeps()
    const result = await updateAsset.call(
      {
        asset: "generic-coffee-table",
        spec: { description: "Oak" },
        dryRun: true,
      },
      deps
    )
    expect(result.isError).toBeUndefined()
    expect(deps.api.assets.update).not.toHaveBeenCalled()
    expect(deps.api.assets.setPreviews).not.toHaveBeenCalled()
    expect(deps.renderer.renderAssetPreviews).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Generic coffee table",
        description: "Oak",
      }),
      ["front", "side", "top", "iso"]
    )
    expect(imagesOf(result)).toBe(5)
    expect(textOf(result)).toContain(
      'Dry run — nothing was saved. The change to "Generic coffee table" (generic-coffee-table: description) is valid.'
    )
  })

  it("reports what the change would break", async () => {
    const deps = fakeDeps()
    const result = await updateAsset.call(
      {
        asset: "generic-coffee-table",
        spec: { dims: { w: 2000, d: 600, h: 400 } },
        dryRun: true,
      },
      deps
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("(dry run — nothing was saved)")
  })
})

describe("delete_asset", () => {
  function custom() {
    return { ...assetDetail(TABLE_ID), source: "custom" as const }
  }

  it("deletes a custom asset no layout uses", async () => {
    const deps = fakeDeps()
    deps.api.assets.getByKey.mockResolvedValueOnce(custom())
    const result = await deleteAsset.call(
      { asset: "generic-coffee-table" },
      deps
    )
    expect(result.isError).toBeUndefined()
    expect(deps.api.assets.remove).toHaveBeenCalledWith({ assetId: TABLE_ID })
    expect(textOf(result)).toBe(
      'Deleted "Generic coffee table" (generic-coffee-table) and its previews.'
    )
  })

  it("refuses library assets", async () => {
    const deps = fakeDeps()
    const result = await deleteAsset.call({ asset: "generic-sofa" }, deps)
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("is a library asset")
    expect(deps.api.assets.remove).not.toHaveBeenCalled()
  })

  it("names every layout that still places it", async () => {
    const deps = fakeDeps()
    deps.api.assets.getByKey.mockResolvedValueOnce(custom())
    deps.api.assets.usage.mockResolvedValueOnce({
      layouts: [
        {
          layoutId: LAYOUT_ID,
          layoutName: "Starter",
          roomId: ROOM_ID,
          count: 2,
        },
      ],
    })
    const result = await deleteAsset.call(
      { asset: "generic-coffee-table" },
      deps
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(
      [
        "Error CONFLICT: Generic coffee table (generic-coffee-table) wasn't deleted: it is placed in 1 layout:",
        `- 'Starter' (layout ${LAYOUT_ID}): 2 placements`,
        "Remove it there or swap it for another asset (apply_changes remove / swap), then delete it.",
      ].join("\n")
    )
    expect(deps.api.assets.remove).not.toHaveBeenCalled()
  })
})

describe("get_asset photos", () => {
  it("returns the stored photos as images on request", async () => {
    const deps = fakeDeps()
    const result = await getAsset.call(
      { asset: "generic-coffee-table", includePhotos: true },
      deps
    )
    expect(imagesOf(result)).toBe(1)
    expect(result.structuredContent).toMatchObject({
      imageNames: ["generic-coffee-table-photo-1"],
    })
    expect(textOf(result)).toContain(
      "Images, in order: generic-coffee-table-photo-1."
    )
  })

  it("says when there are none", async () => {
    const deps = fakeDeps()
    const result = await getAsset.call(
      { asset: "generic-sofa", includePhotos: true },
      deps
    )
    expect(imagesOf(result)).toBe(0)
    expect(textOf(result)).toContain("It has no product photos to return.")
  })
})

describe("preview_asset", () => {
  it("renders the asked views and keeps the other stored previews", async () => {
    const deps = fakeDeps()
    deps.api.assets.getByKey.mockResolvedValueOnce({
      ...assetDetail(SOFA_ID),
      previews: [
        { view: "front", storageId: storageId(90) },
        { view: "iso", storageId: storageId(91) },
      ],
    })
    const result = await previewAsset.call(
      { asset: "generic-sofa", views: ["iso", "top", "iso"] },
      deps
    )
    expect(imagesOf(result)).toBe(2)
    expect(deps.api.assets.setPreviews).toHaveBeenCalledWith({
      assetId: SOFA_ID,
      previews: [
        { view: "front", storageId: storageId(90) },
        { view: "top", storageId: storageId(1) },
        { view: "iso", storageId: storageId(2) },
      ],
    })
    expect(textOf(result)).toContain("1. top (plan")
  })
})

describe("add_asset_images", () => {
  it("reports each URL and the primary photo", async () => {
    const deps = fakeDeps()
    deps.api.assets.addImagesFromUrls.mockResolvedValueOnce({
      results: [
        { url: "https://x.test/a.jpg", ok: true, storageId: storageId(7) },
        {
          url: "https://x.test/b.jpg",
          ok: false,
          error: "The server answered HTTP 403.",
        },
      ],
      images: [
        {
          storageId: storageId(7),
          sourceUrl: "https://x.test/a.jpg",
          primary: true,
        },
      ],
    })
    const result = await addAssetImages.call(
      {
        asset: "generic-sofa",
        urls: ["https://x.test/a.jpg", "https://x.test/b.jpg"],
      },
      deps
    )
    expect(result.isError).toBeUndefined()
    expect(textOf(result)).toContain("1 of 2 photos stored")
    expect(textOf(result)).toContain("(primary: #1)")
    expect(textOf(result)).toContain(
      "- failed https://x.test/b.jpg: The server answered HTTP 403."
    )
  })

  it("is an error when nothing could be stored", async () => {
    const deps = fakeDeps()
    deps.api.assets.addImagesFromUrls.mockResolvedValueOnce({
      results: [
        { url: "https://x.test/a.jpg", ok: false, error: "Not an image." },
      ],
      images: [],
    })
    const result = await addAssetImages.call(
      { asset: "generic-sofa", urls: ["https://x.test/a.jpg"] },
      deps
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("0 of 1 photos stored")
  })
})
