import { describe, expect, it } from "vitest"

import { dragTarget, exceedsDragThreshold, toPlanPoint } from "../pointer"

describe("toPlanPoint", () => {
  it("applies the inverse screen matrix", () => {
    // 1px = 10mm, plan origin at screen (100, 50).
    const inverse = { a: 10, b: 0, c: 0, d: 10, e: -1000, f: -500 }
    expect(toPlanPoint(inverse, 100, 50)).toEqual([0, 0])
    expect(toPlanPoint(inverse, 250, 290)).toEqual([1500, 2400])
  })

  it("handles rotation and skew terms", () => {
    // 90° rotation: screen x → plan z, screen y → plan −x.
    const inverse = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 }
    expect(toPlanPoint(inverse, 3, 4)).toEqual([-4, 3])
  })
})

describe("exceedsDragThreshold", () => {
  it("ignores small jitters", () => {
    expect(exceedsDragThreshold(1, 2)).toBe(false)
  })

  it("starts a drag past the threshold", () => {
    expect(exceedsDragThreshold(3, 0)).toBe(true)
    expect(exceedsDragThreshold(2, 2.5)).toBe(true)
  })
})

describe("dragTarget", () => {
  const start = { origin: [1490, 2400], grab: [1600, 2500] } as const

  it("keeps the grab offset and snaps to 10mm", () => {
    expect(dragTarget(start, [1733, 2618])).toEqual([1620, 2520])
  })

  it("places freely to the millimetre when free", () => {
    expect(dragTarget(start, [1733.4, 2618.6], { free: true })).toEqual([
      1623, 2519,
    ])
  })

  it("returns the origin when the pointer hasn't moved", () => {
    expect(dragTarget(start, [1600, 2500])).toEqual([1490, 2400])
  })
})
