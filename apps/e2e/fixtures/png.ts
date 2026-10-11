/**
 * Reading the PNGs the MCP server returns: header checks without decoding,
 * and exact-colour pixel counts (the id pass is flat and unantialiased, so a
 * placement's palette colour appears verbatim).
 */
import { PNG } from "pngjs"

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Width and height from the IHDR chunk; throws if it isn't a PNG. */
export function pngSize(data: Buffer): { width: number; height: number } {
  if (data.length < 24 || !data.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("Not a PNG (bad signature)")
  }
  if (data.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Not a PNG (IHDR is not the first chunk)")
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

/** "#e6194b" → [230, 25, 75]. */
export function rgbOf(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`)
  const value = Number.parseInt(match[1]!, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/** Pixels of each exact colour (keyed by lower-case `#rrggbb`). */
export function countColours(
  data: Buffer,
  hexes: readonly string[]
): Record<string, number> {
  const png = PNG.sync.read(data)
  const wanted = new Map(
    hexes.map((hex) => [rgbOf(hex).join(","), hex.toLowerCase()])
  )
  const counts: Record<string, number> = Object.fromEntries(
    hexes.map((hex) => [hex.toLowerCase(), 0])
  )
  for (let i = 0; i < png.data.length; i += 4) {
    const key = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`
    const hex = wanted.get(key)
    if (hex !== undefined) counts[hex] = (counts[hex] ?? 0) + 1
  }
  return counts
}

/** How many distinct colours an image uses (a flat pass uses few). */
export function distinctColours(data: Buffer): number {
  const png = PNG.sync.read(data)
  const seen = new Set<number>()
  for (let i = 0; i < png.data.length; i += 4) {
    seen.add((png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!)
  }
  return seen.size
}
