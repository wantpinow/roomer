import { describe, expect, it } from "vitest"

import { OPENAI_MIN_PIXELS, nearestAspectRatio, openAIImageSize } from "../size"

describe("openAIImageSize", () => {
  it("keeps sizes that are already valid", () => {
    expect(openAIImageSize({ width: 1536, height: 1024 })).toBe("1536x1024")
    expect(openAIImageSize({ width: 1024, height: 1024 })).toBe("1024x1024")
    expect(openAIImageSize({ width: 1248, height: 832 })).toBe("1248x832")
  })

  it("rounds sides to multiples of 16", () => {
    expect(openAIImageSize({ width: 1500, height: 1000 })).toBe("1504x1008")
  })

  it("scales small sizes up to the minimum pixel budget, keeping the ratio", () => {
    for (const size of [
      { width: 768, height: 512 },
      { width: 256, height: 256 },
      { width: 512, height: 288 },
    ]) {
      const [w, h] = openAIImageSize(size)!.split("x").map(Number)
      expect(w! % 16).toBe(0)
      expect(h! % 16).toBe(0)
      expect(w! * h!).toBeGreaterThanOrEqual(OPENAI_MIN_PIXELS)
      expect(w! / h!).toBeCloseTo(size.width / size.height, 1)
    }
  })

  it("returns undefined for auto", () => {
    expect(openAIImageSize("auto")).toBeUndefined()
  })
})

describe("nearestAspectRatio", () => {
  it.each([
    [1536, 1024, "3:2"],
    [1248, 832, "3:2"],
    [1024, 1024, "1:1"],
    [1920, 1080, "16:9"],
    [1024, 1536, "2:3"],
    [2048, 860, "21:9"],
    [1200, 1000, "5:4"],
  ] as const)("%i×%i → %s", (width, height, ratio) => {
    expect(nearestAspectRatio({ width, height })).toBe(ratio)
  })

  it("returns undefined for auto", () => {
    expect(nearestAspectRatio("auto")).toBeUndefined()
  })
})
