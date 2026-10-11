import { describe, expect, it } from "vitest"

import { isPng, pngSize, sniffImageMime } from "../png"
import { solidPng } from "./helpers"

const CLAY = solidPng(120, 80, [180, 180, 180])

describe("png helpers", () => {
  it("recognise PNG, JPEG, WebP and GIF headers", () => {
    expect(isPng(CLAY)).toBe(true)
    expect(isPng(Buffer.from([0x89, 0x50]))).toBe(false)
    expect(sniffImageMime(CLAY)).toBe("image/png")
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe(
      "image/jpeg"
    )
    expect(sniffImageMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe(
      "image/webp"
    )
    expect(sniffImageMime(Buffer.from("GIF89a"))).toBe("image/gif")
    expect(sniffImageMime(Buffer.from("hello world!"))).toBeUndefined()
  })

  it("read the size from the IHDR chunk", () => {
    expect(pngSize(solidPng(1536, 4))).toEqual({ width: 1536, height: 4 })
    expect(pngSize(Buffer.from("nope"))).toBeUndefined()
  })
})
