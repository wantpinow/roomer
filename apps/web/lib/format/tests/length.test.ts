import { describe, expect, it } from "vitest"

import {
  formatArea,
  formatDims,
  formatExtent,
  formatLength,
  formatMetres,
  formatMm,
  lengthParts,
} from "../length"

describe("formatMm", () => {
  it("groups thousands and adds the unit", () => {
    expect(formatMm(2980)).toBe("2,980 mm")
    expect(formatMm(18)).toBe("18 mm")
    expect(formatMm(0)).toBe("0 mm")
  })

  it("rounds to whole millimetres and keeps the sign", () => {
    expect(formatMm(1200.4)).toBe("1,200 mm")
    expect(formatMm(-1075.6)).toBe("-1,076 mm")
  })
})

describe("formatMetres", () => {
  it("shows two decimals by default", () => {
    expect(formatMetres(2980)).toBe("2.98 m")
    expect(formatMetres(600)).toBe("0.60 m")
    expect(formatMetres(7690)).toBe("7.69 m")
  })

  it("rounds half up at the requested precision", () => {
    expect(formatMetres(2985)).toBe("2.99 m")
    expect(formatMetres(12_345, 1)).toBe("12.3 m")
  })
})

describe("formatLength", () => {
  it("defaults to millimetres", () => {
    expect(formatLength(2400)).toBe("2,400 mm")
  })

  it("switches to metres on request", () => {
    expect(formatLength(2400, "m")).toBe("2.40 m")
  })
})

describe("formatDims", () => {
  const dims = { w: 2310, d: 915, h: 765 }

  it("writes W × D × H with one trailing unit", () => {
    expect(formatDims(dims)).toBe("2,310 × 915 × 765 mm")
  })

  it("writes metres with two decimals each", () => {
    expect(formatDims(dims, "m")).toBe("2.31 × 0.92 × 0.77 m")
  })
})

describe("formatExtent", () => {
  it("writes width × depth in metres", () => {
    expect(formatExtent(7690, 2980)).toBe("7.69 × 2.98 m")
  })
})

describe("formatArea", () => {
  it("converts mm² to m² with one decimal for rooms", () => {
    // The living room: 2.98 × 7.09 + 2.17 × 0.6 = 22.43 m²
    expect(formatArea(2980 * 7090 + 2170 * 600)).toBe("22.4 m²")
  })

  it("keeps two decimals for small areas", () => {
    expect(formatArea(1200 * 600)).toBe("0.72 m²")
    expect(formatArea(9_990_000)).toBe("9.99 m²")
  })

  it("groups large areas", () => {
    expect(formatArea(1_234_500_000)).toBe("1,234.5 m²")
  })
})

describe("lengthParts", () => {
  it("splits number and unit", () => {
    expect(lengthParts(2980)).toEqual({ value: "2,980", unit: "mm" })
    expect(lengthParts(2980, "m")).toEqual({ value: "2.98", unit: "m" })
  })
})
