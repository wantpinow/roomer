// Tiny PNG header helpers: enough to check what a model sent back and to
// read a pass's pixel size without decoding it.

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

export function isPng(data: Uint8Array): boolean {
  return (
    data.byteLength >= PNG_SIGNATURE.byteLength &&
    PNG_SIGNATURE.every((byte, i) => data[i] === byte)
  )
}

/** Width × height from the IHDR chunk, or undefined if `data` is not a PNG. */
export function pngSize(
  data: Uint8Array
): { width: number; height: number } | undefined {
  // signature (8) + chunk length (4) + "IHDR" (4) + width (4) + height (4)
  if (!isPng(data) || data.byteLength < 24) return undefined
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const type = String.fromCharCode(...data.subarray(12, 16))
  if (type !== "IHDR") return undefined
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Best-effort media type from magic bytes (PNG, JPEG, WebP, GIF). */
export function sniffImageMime(data: Uint8Array): string | undefined {
  if (isPng(data)) return "image/png"
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg"
  }
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...data.subarray(from, to))
  if (
    data.byteLength >= 12 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WEBP"
  )
    return "image/webp"
  if (ascii(0, 4) === "GIF8") return "image/gif"
  return undefined
}
