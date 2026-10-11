import {
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_MEASUREMENTS,
  TEST_ASSETS,
} from "@roomer/core/fixtures"
import {
  zFeatureInput,
  zLayoutOp,
  zPart,
  zPlacementPosition,
  zShellMeasurements,
  zShellOp,
} from "@roomer/core/schema"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { discriminatorValues } from "../compact"
import {
  FEATURE_REFERENCE,
  LAYOUT_OPS_REFERENCE,
  MEASUREMENTS_REFERENCE,
  PART_REFERENCE,
  SHELL_OPS_REFERENCE,
  zListedAssetSpec,
  zListedFeature,
  zListedLayoutOp,
  zListedMeasurements,
  zListedNewRoom,
  zListedPart,
  zListedShellOp,
} from "../listing"

type Union = z.ZodDiscriminatedUnion<readonly z.ZodObject[]>

/** The reference line that documents a variant ("- a|b: fields"). */
function lineFor(reference: string, variant: string): string | undefined {
  return reference
    .split("\n")
    .find((line) =>
      line.replace(/^- /, "").split(":")[0]!.split("|").includes(variant)
    )
}

const REFERENCES: [string, Union, string, readonly string[]][] = [
  ["features", zFeatureInput, FEATURE_REFERENCE, ["id", "label", "assumed"]],
  ["measurements", zShellMeasurements, MEASUREMENTS_REFERENCE, []],
  ["shell ops", zShellOp, SHELL_OPS_REFERENCE, []],
  ["parts", zPart, PART_REFERENCE, ["name", "position", "rotation", "tone"]],
  ["layout ops", zLayoutOp, LAYOUT_OPS_REFERENCE, []],
  ["positions", zPlacementPosition, LAYOUT_OPS_REFERENCE, []],
]

describe("field references", () => {
  it.each(REFERENCES)(
    "document every %s variant and every field it takes",
    (_name, union, reference, statedInHeader) => {
      const key = union.def.discriminator
      for (const option of union.options) {
        const variant = String((option.shape[key] as z.ZodLiteral).value)
        const line = lineFor(reference, variant)
        expect(line, variant).toBeDefined()
        for (const field of Object.keys(option.shape)) {
          if (field === key) continue
          const documented =
            new RegExp(`\\b${field}\\b`).test(line!) ||
            statedInHeader.includes(field) ||
            (line!.includes("wall fields") &&
              ["wall", "offset", "width", "bottom", "height"].includes(field))
          expect(documented, `${variant}.${field}`).toBe(true)
        }
      }
      // Header fields are named in the reference's first line.
      for (const field of statedInHeader) {
        expect(reference.split("\n")[0]).toContain(field)
      }
    }
  )
})

describe("listed stand-ins", () => {
  it("name every discriminator value of the union they stand for", () => {
    const pairs: [z.ZodType, Union][] = [
      [zListedFeature, zFeatureInput],
      [zListedMeasurements, zShellMeasurements],
      [zListedShellOp, zShellOp],
      [zListedPart, zPart],
      [zListedLayoutOp, zLayoutOp],
    ]
    for (const [listed, union] of pairs) {
      const json = JSON.stringify(z.toJSONSchema(listed, { io: "input" }))
      for (const value of discriminatorValues(union)) {
        expect(json).toContain(`"${value}"`)
      }
    }
  })

  it("accept everything the strict schemas accept", () => {
    expect(
      zListedNewRoom.safeParse({
        name: "Living room",
        ceilingHeight: 2450,
        measurements: LIVING_ROOM_MEASUREMENTS,
        features: LIVING_ROOM_FEATURES,
        finishes: { walls: "white" },
      }).success
    ).toBe(true)
    for (const spec of Object.values(TEST_ASSETS)) {
      expect(zListedAssetSpec.safeParse(spec).success, spec.name).toBe(true)
    }
  })
})
