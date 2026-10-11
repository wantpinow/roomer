import { describe, expect, it } from "vitest"

import { snapMm, snapPoint } from "../snap"

describe("snapMm", () => {
  it("rounds to the nearest 10mm by default", () => {
    expect(snapMm(1234)).toBe(1230)
    expect(snapMm(1235)).toBe(1240)
    expect(snapMm(-14)).toBe(-10)
  })

  it("uses the given grid", () => {
    expect(snapMm(1234, 50)).toBe(1250)
    expect(snapMm(1224, 50)).toBe(1200)
  })

  it("just rounds for a grid of 1 or less", () => {
    expect(snapMm(1234.4, 1)).toBe(1234)
    expect(snapMm(1234.6, 0)).toBe(1235)
  })

  it("never returns negative zero", () => {
    expect(Object.is(snapMm(-3), 0)).toBe(true)
    expect(Object.is(snapMm(-0.2, 1), 0)).toBe(true)
  })
})

describe("snapPoint", () => {
  it("snaps both axes to the grid", () => {
    expect(snapPoint([1494.9, 2401.2])).toEqual([1490, 2400])
  })

  it("keeps whole millimetres when free", () => {
    expect(snapPoint([1494.9, 2401.2], { free: true })).toEqual([1495, 2401])
  })
})
