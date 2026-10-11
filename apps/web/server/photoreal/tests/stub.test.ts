import { PNG } from "pngjs"
import { describe, expect, it } from "vitest"

import { PhotorealError } from "../errors"
import { pngSize } from "../png"
import { createStubRenderer, stubPhotoreal } from "../renderers/stub"
import type { InputImage } from "../types"
import { solidPng } from "./helpers"

const CLAY = solidPng(120, 80, [180, 180, 180])

const clayInput: InputImage = {
  role: "clay",
  data: CLAY,
  mime: "image/png",
  label: "clay",
}

function pixel(png: PNG, x: number, y: number): number[] {
  const i = (y * png.width + x) * 4
  return [...png.data.subarray(i, i + 4)]
}

describe("stubPhotoreal", () => {
  it("returns a PNG the size of the clay pass", () => {
    const out = stubPhotoreal(CLAY)
    expect(pngSize(out)).toEqual({ width: 120, height: 80 })
  })

  it("warms the clay: red up, blue down", () => {
    const out = PNG.sync.read(stubPhotoreal(CLAY))
    const [r, g, b, a] = pixel(out, 100, 70)
    expect(r).toBeGreaterThan(180)
    expect(b).toBeLessThan(180)
    expect(r! > g! && g! > b!).toBe(true)
    expect(a).toBe(255)
  })

  it("stamps a small dark STUB mark in the top-left corner only", () => {
    const out = PNG.sync.read(stubPhotoreal(CLAY))
    expect(pixel(out, 7, 7)).toEqual([90, 62, 46, 255]) // mark background
    expect(pixel(out, 10, 10)).toEqual([255, 255, 255, 255]) // ink: S top-left
    expect(pixel(out, 119, 0)).not.toEqual([90, 62, 46, 255])
    expect(pixel(out, 0, 79)).not.toEqual([90, 62, 46, 255])
  })

  it("is deterministic", () => {
    expect(stubPhotoreal(CLAY).equals(stubPhotoreal(CLAY))).toBe(true)
  })

  it("clips the mark on images smaller than it", () => {
    const tiny = PNG.sync.read(stubPhotoreal(solidPng(12, 12)))
    expect(tiny.width).toBe(12)
  })
})

describe("createStubRenderer", () => {
  it("renders from the clay input whatever else is sent", async () => {
    const renderer = createStubRenderer()
    expect(renderer.id).toBe("stub")
    const { png, raw } = await renderer.render({
      prompt: "anything",
      images: [
        { ...clayInput, role: "reference" as const, data: solidPng(5, 5) },
        clayInput,
      ],
      size: { width: 1536, height: 1024 },
      quality: "high",
    })
    expect(png.equals(stubPhotoreal(CLAY))).toBe(true)
    expect(raw).toEqual({ stub: true })
  })

  it("rejects a request without a PNG clay pass", async () => {
    const renderer = createStubRenderer()
    const request = {
      prompt: "",
      size: "auto" as const,
      quality: "low" as const,
    }
    await expect(renderer.render({ ...request, images: [] })).rejects.toThrow(
      PhotorealError
    )
    await expect(
      renderer.render({
        ...request,
        images: [{ ...clayInput, data: Buffer.from("not a png") }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("honours an aborted signal", async () => {
    const controller = new AbortController()
    controller.abort(new Error("stop"))
    await expect(
      createStubRenderer().render({
        prompt: "",
        images: [clayInput],
        size: "auto",
        quality: "low",
        signal: controller.signal,
      })
    ).rejects.toThrow("stop")
  })
})
