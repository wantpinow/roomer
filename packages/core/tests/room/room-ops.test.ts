import { describe, expect, it } from "vitest"

import {
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_MEASUREMENTS,
} from "../../src/fixtures"
import {
  zFeatureInput,
  zFeatureReplacement,
  zNewRoom,
  zShellOp,
} from "../../src/schema"

const [D1] = LIVING_ROOM_FEATURES

describe("zFeatureInput", () => {
  it("accepts every stored feature as-is", () => {
    for (const feature of LIVING_ROOM_FEATURES) {
      expect(zFeatureInput.parse(feature)).toEqual(feature)
    }
  })

  it("accepts a feature without an id", () => {
    const { id: _id, ...door } = D1!
    void _id
    expect(zFeatureInput.parse(door)).toEqual(door)
  })

  it("still validates the rest of the feature", () => {
    expect(zFeatureInput.safeParse({ ...D1, offset: -5 }).success).toBe(false)
  })
})

describe("zFeatureReplacement", () => {
  it("strips an id, since the op names the feature", () => {
    expect(zFeatureReplacement.parse(D1)).not.toHaveProperty("id")
  })
})

describe("zShellOp", () => {
  it("parses each op kind", () => {
    const ops = [
      { op: "addFeature", feature: { type: "pendant", x: 1, z: 2 } },
      {
        op: "updateFeature",
        id: "L1",
        feature: { type: "pendant", x: 3, z: 4 },
      },
      { op: "removeFeature", id: "L1" },
      { op: "setSkirting", skirting: { height: 100, depth: 10 } },
      { op: "setCeilingHeight", ceilingHeight: 2500 },
      { op: "setFinishes", finishes: { walls: "white" } },
      { op: "rename", name: "Den" },
    ]
    for (const op of ops) expect(zShellOp.parse(op)).toEqual(op)
  })

  it("rejects unknown ops and fractional millimetres", () => {
    expect(zShellOp.safeParse({ op: "explode" }).success).toBe(false)
    expect(
      zShellOp.safeParse({ op: "setCeilingHeight", ceilingHeight: 2400.5 })
        .success
    ).toBe(false)
  })
})

describe("zNewRoom", () => {
  it("needs only a name, ceiling height and measurements", () => {
    const input = {
      name: "Living room",
      ceilingHeight: 2450,
      measurements: LIVING_ROOM_MEASUREMENTS,
    }
    expect(zNewRoom.parse(input)).toEqual(input)
  })
})
