import { describe, expect, it } from "vitest"

import { LIVING_ROOM_CORNERS } from "../../src/fixtures"
import { validateShell } from "../../src/shell"

describe("validateShell", () => {
  it("accepts the living room", () => {
    expect(validateShell(LIVING_ROOM_CORNERS)).toEqual([])
  })

  it("needs at least three corners", () => {
    expect(
      validateShell([
        [0, 0],
        [3000, 0],
      ])
    ).toEqual(["A room needs at least 3 corners, but only 2 were given."])
  })

  it("flags walls shorter than 100mm, naming the wall and its corners", () => {
    const problems = validateShell([
      [0, 0],
      [3000, 0],
      [3000, 40],
      [3000, 4000],
      [0, 4000],
    ])
    expect(problems).toEqual([
      "W2 (C2 → C3) is only 40mm long; walls must be at least 100mm. Check for a repeated or mistyped corner.",
    ])
  })

  it("flags walls that cross each other", () => {
    const problems = validateShell([
      [0, 0],
      [3000, 3000],
      [3000, 0],
      [0, 3000],
    ])
    expect(problems).toEqual([
      "Walls W1 and W3 cross each other, so the outline isn't a simple room shape. Check the corner order and coordinates.",
    ])
  })

  it("flags rooms under 1m² (probably metres, not millimetres)", () => {
    const problems = validateShell([
      [0, 0],
      [800, 0],
      [800, 900],
      [0, 900],
    ])
    expect(problems).toEqual([
      "The floor area is 0.72m², below the 1m² minimum. Are the measurements in millimetres?",
    ])
  })
})
