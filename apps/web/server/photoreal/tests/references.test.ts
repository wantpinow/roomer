import { describe, expect, it } from "vitest"

import {
  MIN_REFERENCE_VISIBLE_FRACTION,
  primaryImage,
  selectReferences,
  visibleFraction,
} from "../references"

interface Img {
  url: string
  primary?: boolean
}

const TOTAL = 1536 * 1024
const pixels = (pct: number) => Math.round((TOTAL * pct) / 100)

const placements = [
  { id: "sofa", assetId: "auburn" },
  { id: "coffee-table", assetId: "mori" },
  { id: "chair-1", assetId: "anya" },
  { id: "chair-2", assetId: "anya" },
  { id: "chair-3", assetId: "anya" },
  { id: "chair-4", assetId: "anya" },
  { id: "rug", assetId: "jana" },
]

const imagesByAsset: Record<string, Img[]> = {
  auburn: [{ url: "auburn-front" }, { url: "auburn-angle", primary: true }],
  mori: [{ url: "mori-front" }],
  anya: [{ url: "anya-front" }],
  jana: [{ url: "jana-top" }],
}

describe("primaryImage", () => {
  it("prefers the image flagged primary, else the first", () => {
    expect(primaryImage(imagesByAsset.auburn!)?.url).toBe("auburn-angle")
    expect(primaryImage(imagesByAsset.mori!)?.url).toBe("mori-front")
    expect(primaryImage<Img>([])).toBeUndefined()
  })
})

describe("visibleFraction", () => {
  it("is 0 for an empty frame and never negative", () => {
    expect(visibleFraction(100, 0)).toBe(0)
    expect(visibleFraction(-5, 100)).toBe(0)
    expect(visibleFraction(25, 100)).toBe(0.25)
  })
})

describe("selectReferences", () => {
  it("orders assets by visible area, largest first, one image each", () => {
    const { selected, skipped } = selectReferences({
      placements,
      visibility: {
        totalPixels: TOTAL,
        byPlacement: {
          sofa: pixels(12),
          "coffee-table": pixels(3),
          rug: pixels(8),
          "chair-1": pixels(1),
        },
      },
      imagesByAsset,
      maxReferences: 14,
    })
    expect(selected.map((s) => [s.assetId, s.image.url])).toEqual([
      ["auburn", "auburn-angle"],
      ["jana", "jana-top"],
      ["mori", "mori-front"],
      ["anya", "anya-front"],
    ])
    expect(skipped).toEqual([])
  })

  it("dedupes repeated assets and sums their visible area", () => {
    const { selected } = selectReferences({
      placements,
      visibility: {
        totalPixels: TOTAL,
        // Each chair alone is under the threshold; together they are 0.8%.
        byPlacement: {
          "chair-1": pixels(0.2),
          "chair-2": pixels(0.2),
          "chair-3": pixels(0.2),
          "chair-4": pixels(0.2),
          sofa: pixels(0.5),
        },
      },
      imagesByAsset,
      maxReferences: 14,
    })
    expect(selected.map((s) => s.assetId)).toEqual(["anya", "auburn"])
    const chairs = selected[0]!
    expect(chairs.placementIds).toEqual([
      "chair-1",
      "chair-2",
      "chair-3",
      "chair-4",
    ])
    expect(chairs.visibleFraction).toBeCloseTo(0.008, 4)
  })

  it("skips items under the minimum share of the frame and unseen items", () => {
    const { selected, skipped } = selectReferences({
      placements,
      visibility: {
        totalPixels: TOTAL,
        byPlacement: {
          sofa: pixels(10),
          "coffee-table": pixels(MIN_REFERENCE_VISIBLE_FRACTION * 100 * 0.9),
        },
      },
      imagesByAsset,
      maxReferences: 14,
    })
    expect(selected.map((s) => s.assetId)).toEqual(["auburn"])
    expect(skipped.map((s) => [s.assetId, s.reason])).toEqual([
      ["mori", "too-small"],
      ["anya", "not-visible"],
      ["jana", "not-visible"],
    ])
  })

  it("honours a custom minimum share", () => {
    const { selected } = selectReferences({
      placements,
      visibility: {
        totalPixels: TOTAL,
        byPlacement: { sofa: pixels(10), "coffee-table": pixels(2) },
      },
      imagesByAsset,
      maxReferences: 14,
      minVisibleFraction: 0.05,
    })
    expect(selected.map((s) => s.assetId)).toEqual(["auburn"])
  })

  it("skips visible assets that have no images", () => {
    const { selected, skipped } = selectReferences({
      placements: [
        { id: "tv", assetId: "generic-tv" },
        { id: "sofa", assetId: "auburn" },
      ],
      visibility: {
        totalPixels: TOTAL,
        byPlacement: { tv: pixels(5), sofa: pixels(4) },
      },
      imagesByAsset,
      maxReferences: 14,
    })
    expect(selected.map((s) => s.assetId)).toEqual(["auburn"])
    expect(skipped).toEqual([
      {
        assetId: "generic-tv",
        placementIds: ["tv"],
        visibleFraction: expect.closeTo(0.05, 4),
        reason: "no-image",
      },
    ])
  })

  it("caps the list at maxReferences and drops the smallest", () => {
    const { selected, skipped } = selectReferences({
      placements,
      visibility: {
        totalPixels: TOTAL,
        byPlacement: {
          sofa: pixels(12),
          rug: pixels(8),
          "coffee-table": pixels(3),
          "chair-1": pixels(1),
        },
      },
      imagesByAsset,
      maxReferences: 2,
    })
    expect(selected.map((s) => s.assetId)).toEqual(["auburn", "jana"])
    expect(skipped.map((s) => [s.assetId, s.reason])).toEqual([
      ["mori", "over-limit"],
      ["anya", "over-limit"],
    ])
  })

  it("selects nothing when the limit is zero or negative", () => {
    for (const maxReferences of [0, -3, 0.5]) {
      const { selected, skipped } = selectReferences({
        placements: [{ id: "sofa", assetId: "auburn" }],
        visibility: { totalPixels: TOTAL, byPlacement: { sofa: pixels(10) } },
        imagesByAsset,
        maxReferences,
      })
      expect(selected).toEqual([])
      expect(skipped[0]?.reason).toBe("over-limit")
    }
  })

  it("breaks ties by placement order", () => {
    const { selected } = selectReferences({
      placements: [
        { id: "rug", assetId: "jana" },
        { id: "coffee-table", assetId: "mori" },
      ],
      visibility: {
        totalPixels: TOTAL,
        byPlacement: { rug: pixels(5), "coffee-table": pixels(5) },
      },
      imagesByAsset,
      maxReferences: 14,
    })
    expect(selected.map((s) => s.assetId)).toEqual(["jana", "mori"])
  })
})
