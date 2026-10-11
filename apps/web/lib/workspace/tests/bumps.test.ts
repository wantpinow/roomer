import { describe, expect, it } from "vitest"

import { shouldAnnounceBump } from "../bumps"

describe("shouldAnnounceBump", () => {
  it("announces the first bump", () => {
    expect(shouldAnnounceBump(null, { bumped: "sofa", at: 1 })).toBe(true)
  })

  it("stays quiet while sliding along the same thing", () => {
    expect(
      shouldAnnounceBump({ bumped: "sofa", at: 1 }, { bumped: "sofa", at: 1.5 })
    ).toBe(false)
  })

  it("announces the same thing again after a quiet spell", () => {
    expect(
      shouldAnnounceBump({ bumped: "sofa", at: 1 }, { bumped: "sofa", at: 3 })
    ).toBe(true)
  })

  it("announces something different straight away", () => {
    expect(
      shouldAnnounceBump({ bumped: "sofa", at: 1 }, { bumped: "wall", at: 1.1 })
    ).toBe(true)
  })
})
