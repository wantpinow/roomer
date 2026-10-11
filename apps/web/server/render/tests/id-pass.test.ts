import { describe, expect, it } from "vitest"

import { countPalettePixels, decodePng } from "../id-pass"
import { type DecodedPng, encodePng } from "../png"

/** A width × height image filled by `paint(x, y)` → [r, g, b]. */
function image(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number]
): DecodedPng {
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y)
      data.set([r, g, b, 255], (y * width + x) * 4)
    }
  }
  return { width, height, data }
}

const RED: [number, number, number] = [0xe6, 0x19, 0x4b]
const GREEN: [number, number, number] = [0x3c, 0xb4, 0x4b]
const WALL: [number, number, number] = [0xd9, 0xd9, 0xd9]

// 8 × 4: a 3 × 2 red block at (1, 1), one green pixel at (6, 3), one
// off-by-one red pixel at (7, 0) (what antialiasing would leave), wall
// everywhere else.
const synthetic = image(8, 4, (x, y) => {
  if (x >= 1 && x <= 3 && y >= 1 && y <= 2) return RED
  if (x === 6 && y === 3) return GREEN
  if (x === 7 && y === 0) return [0xe6, 0x19, 0x4c]
  return WALL
})

describe("countPalettePixels", () => {
  const palette = ["#E6194B", "#3cb44b", "#4363d8", "#d9d9d9"]

  it("counts exact matches per colour with their bounds", () => {
    const counts = countPalettePixels(encodePng(synthetic), palette)
    expect(counts).toMatchObject({ width: 8, height: 4, total: 32 })
    expect(counts.colors["#e6194b"]).toEqual({
      hex: "#e6194b",
      pixels: 6,
      share: 6 / 32,
      bounds: { x0: 1, y0: 1, x1: 3, y1: 2 },
    })
    expect(counts.colors["#3cb44b"]).toMatchObject({
      pixels: 1,
      bounds: { x0: 6, y0: 3, x1: 6, y1: 3 },
    })
    expect(counts.colors["#d9d9d9"]!.pixels).toBe(24)
  })

  it("reports palette colours that never appear", () => {
    const counts = countPalettePixels(synthetic, palette)
    expect(counts.colors["#4363d8"]).toEqual({
      hex: "#4363d8",
      pixels: 0,
      share: 0,
      bounds: null,
    })
  })

  it("counts near-misses as unmatched and names them", () => {
    const counts = countPalettePixels(synthetic, palette)
    expect(counts.unmatched).toBe(1)
    expect(counts.unmatchedColors).toEqual([{ hex: "#e6194c", pixels: 1 }])
  })

  it("treats everything as unmatched with an empty palette", () => {
    const counts = countPalettePixels(synthetic, [])
    expect(counts.unmatched).toBe(32)
    expect(counts.colors).toEqual({})
    expect(counts.unmatchedColors[0]).toEqual({ hex: "#d9d9d9", pixels: 24 })
  })

  it("rejects malformed palette colours", () => {
    expect(() => countPalettePixels(synthetic, ["red"])).toThrow(
      "Not a #rrggbb colour"
    )
  })
})

describe("decodePng", () => {
  it("round-trips RGBA pixels", () => {
    const decoded = decodePng(encodePng(synthetic))
    expect(decoded.width).toBe(8)
    expect(decoded.height).toBe(4)
    expect(decoded.data.equals(synthetic.data)).toBe(true)
  })
})
