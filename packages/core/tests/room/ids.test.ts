import { describe, expect, it } from "vitest"

import { LIVING_ROOM_FEATURES } from "../../src/fixtures"
import { assignFeatureId, withFeatureIds } from "../../src/room"

const livingRoomIds = LIVING_ROOM_FEATURES.map((f) => f.id)

describe("assignFeatureId", () => {
  it("starts each type's sequence at 1", () => {
    expect(assignFeatureId("door", [])).toBe("D1")
    expect(assignFeatureId("window", [])).toBe("WIN1")
    expect(assignFeatureId("radiator", [])).toBe("RAD1")
    expect(assignFeatureId("smoke-alarm", [])).toBe("SA1")
  })

  it("continues after the highest number in use for the prefix", () => {
    expect(assignFeatureId("door", livingRoomIds)).toBe("D3")
    expect(assignFeatureId("socket", livingRoomIds)).toBe("S5")
    expect(assignFeatureId("window", livingRoomIds)).toBe("WIN2")
  })

  it("never reuses a gap left by a removed feature", () => {
    expect(assignFeatureId("door", ["D1", "D4"])).toBe("D5")
  })

  it("shares the L sequence between pendants and ceiling lights", () => {
    expect(assignFeatureId("ceiling-light", livingRoomIds)).toBe("L3")
    expect(assignFeatureId("pendant", ["L1", "L2", "L3"])).toBe("L4")
  })

  it("only counts ids that are exactly prefix + number", () => {
    // S is a prefix of SW, SA and SP, and agents may choose ids like S1-old.
    expect(assignFeatureId("socket", ["SW4", "SA2", "SP9", "S1-old"])).toBe(
      "S1"
    )
    expect(assignFeatureId("switch", ["S7", "SW2"])).toBe("SW3")
  })
})

describe("withFeatureIds", () => {
  it("keeps given ids and assigns the rest in order", () => {
    const features = withFeatureIds([
      { type: "door" as const, id: "D2" },
      { type: "door" as const },
      { type: "window" as const },
      { type: "door" as const },
    ])
    expect(features.map((f) => f.id)).toEqual(["D2", "D3", "WIN1", "D4"])
  })

  it("does not clash with an id given later in the list", () => {
    const features = withFeatureIds([
      { type: "door" as const },
      { type: "door" as const, id: "D1" },
    ])
    expect(features.map((f) => f.id)).toEqual(["D2", "D1"])
  })
})
