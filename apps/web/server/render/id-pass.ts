import { hexToRgb } from "@/lib/scene/id-pass"

import { type DecodedPng, decodePng } from "./png"

export { type DecodedPng, decodePng } from "./png"

// Reads an id-pass render back into per-colour pixel counts. The id pass
// draws every placed item in an exact flat palette colour (no antialiasing,
// no tone mapping), so an exact byte match tells which items are visible,
// how much of the frame each fills and where (for bounding-box prompts).

export interface PixelBounds {
  /** Inclusive pixel bounds, origin top-left. */
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface PaletteColorCount {
  hex: string
  pixels: number
  /** pixels / total pixels. */
  share: number
  /** Where the colour appears; null when it doesn't. */
  bounds: PixelBounds | null
}

export interface PaletteCounts {
  width: number
  height: number
  total: number
  /** Keyed by lowercase `#rrggbb`, one entry per palette colour. */
  colors: Record<string, PaletteColorCount>
  /** Pixels matching no palette colour exactly. */
  unmatched: number
  /** The most common unmatched colours (at most 8), for diagnosing leaks. */
  unmatchedColors: { hex: string; pixels: number }[]
}

const toHex = (rgb: number) => `#${rgb.toString(16).padStart(6, "0")}`

/**
 * Counts pixels of each palette colour by exact RGB match (alpha ignored).
 * Accepts encoded PNG bytes or an already decoded image.
 */
export function countPalettePixels(
  png: Buffer | DecodedPng,
  palette: readonly string[]
): PaletteCounts {
  const image = Buffer.isBuffer(png) ? decodePng(png) : png
  const { width, height, data } = image
  const lookup = new Map<number, string>()
  const counts = new Map<
    string,
    { pixels: number; x0: number; y0: number; x1: number; y1: number }
  >()
  for (const raw of palette) {
    const hex = raw.toLowerCase()
    const [r, g, b] = hexToRgb(hex)
    lookup.set((r << 16) | (g << 8) | b, hex)
    counts.set(hex, { pixels: 0, x0: Infinity, y0: Infinity, x1: -1, y1: -1 })
  }
  const others = new Map<number, number>()
  let unmatched = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const rgb = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!
      const hex = lookup.get(rgb)
      if (hex === undefined) {
        unmatched++
        others.set(rgb, (others.get(rgb) ?? 0) + 1)
        continue
      }
      const c = counts.get(hex)!
      c.pixels++
      if (x < c.x0) c.x0 = x
      if (x > c.x1) c.x1 = x
      if (y < c.y0) c.y0 = y
      if (y > c.y1) c.y1 = y
    }
  }
  const total = width * height
  const colors: Record<string, PaletteColorCount> = {}
  for (const [hex, c] of counts) {
    colors[hex] = {
      hex,
      pixels: c.pixels,
      share: total === 0 ? 0 : c.pixels / total,
      bounds:
        c.pixels === 0 ? null : { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 },
    }
  }
  const unmatchedColors = [...others]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([rgb, pixels]) => ({ hex: toHex(rgb), pixels }))
  return { width, height, total, colors, unmatched, unmatchedColors }
}
