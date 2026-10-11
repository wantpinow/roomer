import { PNG } from "pngjs"

// PNG helpers for the headless renderer and the photoreal pipeline: data
// URL → bytes, a cheap size read from the header, and full decoding.

const DATA_URL_PREFIX = "data:image/png;base64,"
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface DecodedPng {
  width: number
  height: number
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Buffer
}

export function pngFromDataUrl(dataUrl: string): Buffer {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) {
    throw new Error(
      `Expected a PNG data URL, got "${dataUrl.slice(0, 32)}${dataUrl.length > 32 ? "…" : ""}"`
    )
  }
  return Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64")
}

/** Width and height from the IHDR chunk, without decoding pixels. */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || !png.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("Not a PNG")
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

export function decodePng(png: Buffer): DecodedPng {
  const { width, height, data } = PNG.sync.read(png)
  return { width, height, data }
}

/** Encodes RGBA pixels (tests, debugging overlays). */
export function encodePng(image: DecodedPng): Buffer {
  const png = new PNG({ width: image.width, height: image.height })
  image.data.copy(png.data)
  return PNG.sync.write(png)
}
