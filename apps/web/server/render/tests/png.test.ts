import { describe, expect, it } from "vitest"

import { encodePng, pngFromDataUrl, pngSize } from "../png"

const tiny = encodePng({
  width: 3,
  height: 2,
  data: Buffer.alloc(3 * 2 * 4, 255),
})

describe("pngFromDataUrl", () => {
  it("decodes a PNG data URL to bytes", () => {
    const url = `data:image/png;base64,${tiny.toString("base64")}`
    expect(pngFromDataUrl(url).equals(tiny)).toBe(true)
  })

  it("rejects anything that isn't a PNG data URL", () => {
    expect(() => pngFromDataUrl("data:image/jpeg;base64,AAAA")).toThrow(
      'Expected a PNG data URL, got "data:image/jpeg;base64,AAAA"'
    )
  })
})

describe("pngSize", () => {
  it("reads width and height from the header", () => {
    expect(pngSize(tiny)).toEqual({ width: 3, height: 2 })
  })

  it("rejects bytes that aren't a PNG", () => {
    expect(() => pngSize(Buffer.from("GIF89a, definitely not a png"))).toThrow(
      "Not a PNG"
    )
  })
})
