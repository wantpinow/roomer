import { describe, expect, it } from "vitest"

import { joinChangeSummaries } from "../../src/room"

describe("joinChangeSummaries", () => {
  it("joins summaries into one sentence, continuing in lower case", () => {
    expect(
      joinChangeSummaries(["Added sofa", "Moved coffee table 150mm right"])
    ).toBe("Added sofa, moved coffee table 150mm right")
  })

  it("never lower-cases an id at the start of a summary", () => {
    expect(joinChangeSummaries(["Added rug", "D2 now swings out"])).toBe(
      "Added rug, D2 now swings out"
    )
  })

  it("counts summaries beyond the listed maximum", () => {
    expect(
      joinChangeSummaries(["Added a", "Added b", "Added c", "Added d"], 2)
    ).toBe("Added a, added b and 2 more changes")
    expect(joinChangeSummaries(["Added a", "Added b"], 1)).toBe(
      "Added a and 1 more change"
    )
  })

  it("says so when there is nothing to summarise", () => {
    expect(joinChangeSummaries([])).toBe("No changes")
  })
})
