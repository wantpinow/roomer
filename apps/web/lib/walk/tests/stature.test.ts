import { describe, expect, it } from "vitest"

import {
  DEFAULT_STATURE_MM,
  formatEyeHeight,
  formatStature,
  parseStature,
  stepStature,
  walkerSize,
} from "../stature"

describe("walkerSize", () => {
  it("puts a six-footer's eyes at ≈1,711 mm", () => {
    expect(walkerSize()).toEqual({ height: 1830, eyeHeight: 1711 })
  })

  it("scales eye height with stature", () => {
    expect(walkerSize(1626)).toEqual({ height: 1626, eyeHeight: 1520 })
  })
})

describe("stepStature", () => {
  it("moves in whole inches", () => {
    expect(stepStature(DEFAULT_STATURE_MM, 1)).toBe(1854) // 6′1″
    expect(stepStature(DEFAULT_STATURE_MM, -1)).toBe(1803) // 5′11″
  })

  it("stays within 4′10″ and 6′10″", () => {
    expect(stepStature(1473, -1)).toBe(1473)
    expect(stepStature(2083, 1)).toBe(2083)
    expect(formatStature(stepStature(9999, 0))).toBe("6′10″")
  })

  it("leaves the value alone for a zero step in range", () => {
    expect(stepStature(1830, 0)).toBe(1830)
  })
})

describe("formatStature", () => {
  it("writes feet and inches", () => {
    expect(formatStature(1830)).toBe("6′0″")
    expect(formatStature(1626)).toBe("5′4″")
    expect(formatStature(1473)).toBe("4′10″")
  })
})

describe("formatEyeHeight", () => {
  it("writes metres to two decimals", () => {
    expect(formatEyeHeight(1711)).toBe("1.71 m")
    expect(formatEyeHeight(1520)).toBe("1.52 m")
  })
})

describe("parseStature", () => {
  it("reads a remembered value", () => {
    expect(parseStature("1854")).toBe(1854)
  })

  it("ignores missing, garbled or implausible values", () => {
    expect(parseStature(null)).toBeNull()
    expect(parseStature("")).toBeNull()
    expect(parseStature("tall")).toBeNull()
    expect(parseStature("900")).toBeNull()
    expect(parseStature("3000")).toBeNull()
  })
})
