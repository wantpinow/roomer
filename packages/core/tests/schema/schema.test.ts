import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_FINISHES,
  LIVING_ROOM_MEASUREMENTS,
  LIVING_ROOM_NAME,
  LIVING_ROOM_SKIRTING,
  TEST_ASSETS,
} from "../../src/fixtures"
import {
  FEATURE_ID_PREFIX,
  ID_PASS_PALETTE,
  LINT_CODES,
  LINT_RULES,
  zAssetSpec,
  zBearing,
  zFeature,
  zLayoutOp,
  zLintIssue,
  zPlacement,
  zPlacementPosition,
  zRoomSpec,
  zShellMeasurements,
  zSlug,
} from "../../src/schema"

describe("zRoomSpec", () => {
  it("accepts the living room fixture", () => {
    const room = zRoomSpec.parse({
      name: LIVING_ROOM_NAME,
      ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
      shell: {
        measurements: LIVING_ROOM_MEASUREMENTS,
        corners: LIVING_ROOM_CORNERS,
        solve: {
          method: "walk",
          residualMm: 0,
          cornerAngles: [],
          warnings: [],
        },
      },
      skirting: LIVING_ROOM_SKIRTING,
      features: LIVING_ROOM_FEATURES,
      finishes: LIVING_ROOM_FINISHES,
      cameras: [],
    })
    expect(room.features).toHaveLength(LIVING_ROOM_FEATURES.length)
  })

  it("rejects fractional millimetres", () => {
    const result = zShellMeasurements.safeParse({
      kind: "rectangle",
      width: 2980.5,
      depth: 4000,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a shell with fewer than 3 walk segments", () => {
    const result = zShellMeasurements.safeParse({
      kind: "walk",
      segments: [{ length: 1000 }, { length: 1000 }],
    })
    expect(result.success).toBe(false)
  })
})

describe("zFeature", () => {
  it("discriminates on type", () => {
    const door = zFeature.parse(LIVING_ROOM_FEATURES[0])
    expect(door.type).toBe("door")
  })

  it("rejects a door without a hinge side", () => {
    const result = zFeature.safeParse({
      type: "door",
      id: "D9",
      wall: "W1",
      offset: 100,
      width: 800,
      bottom: 0,
      height: 1980,
      swing: "in",
    })
    expect(result.success).toBe(false)
  })

  it("rejects malformed wall ids", () => {
    const result = zFeature.safeParse({
      ...LIVING_ROOM_FEATURES[0],
      wall: "north",
    })
    expect(result.success).toBe(false)
  })

  it("has an id prefix for every feature type", () => {
    const types = zFeature.options.map((option) => option.shape.type.value)
    expect(Object.keys(FEATURE_ID_PREFIX).sort()).toEqual([...types].sort())
  })
})

describe("zAssetSpec", () => {
  it.each(Object.entries(TEST_ASSETS))("accepts fixture %s", (_name, asset) => {
    expect(zAssetSpec.safeParse(asset).success).toBe(true)
  })

  it("requires at least one part", () => {
    const result = zAssetSpec.safeParse({
      ...TEST_ASSETS.coffeeTable,
      geometry: { kind: "parts", parts: [] },
    })
    expect(result.success).toBe(false)
  })

  it("rejects a product url that isn't a url", () => {
    const result = zAssetSpec.safeParse({
      ...TEST_ASSETS.sofa,
      product: { url: "castlery sofa", dimsSource: "listing" },
    })
    expect(result.success).toBe(false)
  })
})

describe("placements and ops", () => {
  it("keeps stored bearings in [0, 360)", () => {
    expect(zBearing.safeParse(359.9).success).toBe(true)
    expect(zBearing.safeParse(360).success).toBe(false)
    expect(zBearing.safeParse(-1).success).toBe(false)
  })

  it("accepts every placement position mode", () => {
    const positions = [
      { mode: "at", x: 1000, z: 2000, facing: 90 },
      { mode: "against", wall: "W6", at: 3000, anchor: "center", side: "back" },
      { mode: "onWall", wall: "W6", at: 3000, elevation: 900 },
      { mode: "centerOn", placement: "coffee-table" },
      { mode: "inCorner", corner: "C1", against: "incoming" },
    ]
    for (const position of positions) {
      expect(zPlacementPosition.safeParse(position).success).toBe(true)
    }
  })

  it("parses a batch of layout ops", () => {
    const ops = z.array(zLayoutOp).parse([
      {
        op: "add",
        asset: "castlery-auburn-chaise-sofa-left",
        position: { mode: "against", wall: "W6", at: 2000 },
      },
      { op: "nudge", id: "sofa", dz: -50, rotate: 90 },
      { op: "swap", id: "sofa", asset: "test-sofa" },
      { op: "remove", id: "sofa" },
    ])
    expect(ops.map((op) => op.op)).toEqual(["add", "nudge", "swap", "remove"])
  })

  it("rejects placement ids that aren't slugs", () => {
    expect(zSlug.safeParse("Dining Table").success).toBe(false)
    expect(
      zPlacement.safeParse({
        id: "Dining Table",
        assetId: "a1",
        x: 0,
        z: 0,
        facing: 0,
        elevation: 0,
      }).success
    ).toBe(false)
  })
})

describe("lint rules", () => {
  it("derives codes from the rule table", () => {
    expect(LINT_CODES).toEqual(Object.keys(LINT_RULES))
  })

  it("prefixes match severities", () => {
    for (const [code, rule] of Object.entries(LINT_RULES)) {
      const expected = { E: "error", W: "warning", I: "info" }[code[0]!]
      expect(rule.severity).toBe(expected)
    }
  })

  it("validates an issue", () => {
    const issue = zLintIssue.parse({
      code: "E001",
      severity: "error",
      message: "Sofa overlaps Coffee table by 120mm × 340mm.",
      placementIds: ["sofa", "coffee-table"],
      featureIds: [],
    })
    expect(issue.code).toBe("E001")
  })
})

describe("id pass palette", () => {
  it("has unique names and colours", () => {
    const names = new Set(ID_PASS_PALETTE.map((c) => c.name))
    const hexes = new Set(ID_PASS_PALETTE.map((c) => c.hex))
    expect(names.size).toBe(ID_PASS_PALETTE.length)
    expect(hexes.size).toBe(ID_PASS_PALETTE.length)
  })
})
