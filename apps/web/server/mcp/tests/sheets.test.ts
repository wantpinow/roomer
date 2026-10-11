import { assetLocalBounds } from "@roomer/core/assets"
import { SOFA } from "@roomer/core/fixtures"
import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { decodePng, pngSize } from "../../render/png"
import {
  comparisonSheet,
  markerArrows,
  markOrientation,
  photoToPng,
  SHEET_CELL,
} from "../sheets"
import { solidPng } from "./fakes"

const BOUNDS = assetLocalBounds(SOFA)

async function webp(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 4, background: "#a05030" },
  })
    .webp()
    .toBuffer()
}

/** Fraction of pixels that differ between two same-size PNGs. */
function changed(a: Buffer, b: Buffer): number {
  const x = decodePng(a)
  const y = decodePng(b)
  let differ = 0
  for (let i = 0; i < x.data.length; i += 4) {
    if (
      x.data[i] !== y.data[i] ||
      x.data[i + 1] !== y.data[i + 1] ||
      x.data[i + 2] !== y.data[i + 2]
    ) {
      differ++
    }
  }
  return differ / (x.width * x.height)
}

describe("photoToPng", () => {
  it("turns a WebP photo into a PNG within the size limit", async () => {
    const png = await photoToPng(await webp(2400, 1600), 1024)
    expect(png.subarray(1, 4).toString()).toBe("PNG")
    expect(pngSize(png)).toEqual({ width: 1024, height: 683 })
  })

  it("never enlarges a small photo", async () => {
    const png = await photoToPng(await webp(300, 200), 1024)
    expect(pngSize(png)).toEqual({ width: 300, height: 200 })
  })

  it("flattens transparency onto white", async () => {
    const clear = await sharp({
      create: { width: 4, height: 4, channels: 4, background: "#00000000" },
    })
      .png()
      .toBuffer()
    const { data } = decodePng(await photoToPng(clear))
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 255, 255, 255])
  })
})

describe("markerArrows", () => {
  it("shows x to the right and the front down the image from the top", () => {
    const arrows = markerArrows("top", BOUNDS, 1)
    const x = arrows.find((a) => a.label === "x")!
    const front = arrows.find((a) => a.label === "front +z")!
    expect(x.dx).toBeCloseTo(1)
    expect(x.dy).toBeCloseTo(0)
    expect(front.dx).toBeCloseTo(0)
    expect(front.dy).toBeCloseTo(1)
    // y points at the camera: no arrow.
    expect(arrows.map((a) => a.label)).not.toContain("y")
  })

  it("shows up as up, the front to the lower left and x to the right in iso", () => {
    const arrows = markerArrows("iso", BOUNDS, 1)
    const byLabel = Object.fromEntries(arrows.map((a) => [a.label, a]))
    expect(byLabel.y!.dy).toBeLessThan(-0.8)
    expect(byLabel["front +z"]!.dx).toBeLessThan(0)
    expect(byLabel["front +z"]!.dy).toBeGreaterThan(0)
    expect(byLabel.x!.dx).toBeGreaterThan(0.5)
  })
})

describe("markOrientation", () => {
  it("draws a marker in the bottom-left corner of top and iso previews", async () => {
    const preview = solidPng(256, 256, [239, 237, 233])
    for (const view of ["top", "iso"] as const) {
      const marked = await markOrientation(preview, view, BOUNDS)
      expect(pngSize(marked)).toEqual({ width: 256, height: 256 })
      const share = changed(preview, marked)
      expect(share).toBeGreaterThan(0.02)
      expect(share).toBeLessThan(0.4)
      // The top-right corner is untouched.
      const { data, width } = decodePng(marked)
      const i = (10 * width + 245) * 4
      expect([data[i], data[i + 1], data[i + 2]]).toEqual([239, 237, 233])
    }
  })

  it("leaves front and side previews alone", async () => {
    const preview = solidPng(64, 64)
    expect(await markOrientation(preview, "front", BOUNDS)).toBe(preview)
    expect(await markOrientation(preview, "side", BOUNDS)).toBe(preview)
  })
})

describe("comparisonSheet", () => {
  const clay = [
    { png: solidPng(768, 768), label: "CLAY · FRONT" },
    { png: solidPng(768, 768), label: "CLAY · ISO" },
  ]

  it("puts one photo and the clay views in a row", async () => {
    const sheet = await comparisonSheet({
      title: "Sofa",
      photos: [{ png: solidPng(900, 600, [160, 80, 48]), label: "PHOTO 1" }],
      clay,
    })
    const { width, height } = pngSize(sheet)
    expect(width).toBe(3 * SHEET_CELL + 4 * 16)
    expect(height).toBeLessThan(SHEET_CELL + 150)
  })

  it("puts two photos above the clay views", async () => {
    const sheet = await comparisonSheet({
      title: "Sofa",
      photos: [
        { png: solidPng(900, 600, [160, 80, 48]), label: "PHOTO 1" },
        { png: solidPng(600, 900, [48, 80, 160]), label: "PHOTO 2" },
      ],
      clay,
    })
    const { width, height } = pngSize(sheet)
    expect(width).toBe(2 * SHEET_CELL + 3 * 16)
    expect(height).toBeGreaterThan(2 * SHEET_CELL)
    // The first photo is fitted (not cropped) into the top-left cell: its
    // colour is in the cell's middle row, with white bands above and below.
    const { data, width: w } = decodePng(sheet)
    const px = (x: number, y: number) => {
      const i = (y * w + x) * 4
      return [data[i], data[i + 1], data[i + 2]]
    }
    const cellTop = 48 + 16 + 34
    expect(px(16 + SHEET_CELL / 2, cellTop + SHEET_CELL / 2)).toEqual([
      160, 80, 48,
    ])
    expect(px(16 + SHEET_CELL / 2, cellTop + 10)).toEqual([255, 255, 255])
  })
})
