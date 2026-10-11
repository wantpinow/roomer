import { describe, expect, it } from "vitest"

import { formatPosition } from "../position"

const at = { x: 1490, z: 2400 }

describe("formatPosition", () => {
  it("reads against-wall placements", () => {
    expect(
      formatPosition({ mode: "against", wall: "W6", along: 2400 }, at)
    ).toBe("against W6 · 2,400 mm")
  })

  it("reads wall-mounted placements", () => {
    expect(
      formatPosition({ mode: "onWall", wall: "W2", along: 1200 }, at)
    ).toBe("on W2 · 1,200 mm")
  })

  it("reads corner placements", () => {
    expect(formatPosition({ mode: "corner", corner: "C3" }, at)).toBe("in C3")
  })

  it("falls back to plan coordinates", () => {
    expect(formatPosition(undefined, at)).toBe("x 1,490 · z 2,400 mm")
  })
})
