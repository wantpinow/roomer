import { SOFA } from "@roomer/core/fixtures"
import { describe, expect, it } from "vitest"

import { fakeDeps, SOFA_ID, storageId } from "../../mcp/tests/fakes"
import {
  mergePreviews,
  normalizeViews,
  renderAndStoreAssetPreviews,
} from "../asset-previews"

describe("normalizeViews", () => {
  it("defaults to all four, dedupes and orders canonically", () => {
    expect(normalizeViews(undefined)).toEqual(["front", "side", "top", "iso"])
    expect(normalizeViews([])).toEqual(["front", "side", "top", "iso"])
    expect(normalizeViews(["iso", "front", "iso"])).toEqual(["front", "iso"])
  })
})

describe("mergePreviews", () => {
  it("replaces re-rendered views and keeps the rest, in view order", () => {
    type Preview = { view: "front" | "side" | "top" | "iso"; id: number }
    const existing: Preview[] = [
      { view: "iso", id: 1 },
      { view: "front", id: 2 },
    ]
    const merged = mergePreviews(existing, [
      { view: "iso", id: 3 },
      { view: "side", id: 4 },
    ])
    expect(merged).toEqual([
      { view: "front", id: 2 },
      { view: "side", id: 4 },
      { view: "iso", id: 3 },
    ])
  })
})

describe("renderAndStoreAssetPreviews", () => {
  it("uploads each render and attaches the merged previews", async () => {
    const deps = fakeDeps()
    const images = await renderAndStoreAssetPreviews(
      deps,
      {
        assetId: SOFA_ID,
        spec: SOFA,
        previews: [{ view: "top", storageId: storageId(50) }],
      },
      ["front"]
    )
    expect(images.map((i) => i.view)).toEqual(["front"])
    expect(deps.api.files.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/png"
    )
    expect(deps.api.assets.setPreviews).toHaveBeenCalledWith({
      assetId: SOFA_ID,
      previews: [
        { view: "front", storageId: storageId(1) },
        { view: "top", storageId: storageId(50) },
      ],
    })
  })

  it("stores nothing when rendering fails", async () => {
    const deps = fakeDeps()
    deps.renderer.renderAssetPreviews.mockRejectedValueOnce(
      new Error("no browser")
    )
    await expect(
      renderAndStoreAssetPreviews(deps, {
        assetId: SOFA_ID,
        spec: SOFA,
        previews: [],
      })
    ).rejects.toThrow("no browser")
    expect(deps.api.assets.setPreviews).not.toHaveBeenCalled()
  })
})
