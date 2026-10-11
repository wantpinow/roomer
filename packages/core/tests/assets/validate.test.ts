import { describe, expect, it } from "vitest"

import { validateAsset } from "../../src/assets"
import { COFFEE_TABLE, SOFA, TEST_ASSETS, WALL_TV } from "../../src/fixtures"
import type { AssetSpec, Part } from "../../src/schema"

/** Copy an asset with every part moved by (dx, dy, dz). */
function shifted(
  asset: AssetSpec,
  dx: number,
  dy: number,
  dz: number
): AssetSpec {
  return {
    ...asset,
    geometry: {
      kind: "parts",
      parts: asset.geometry.parts.map((part) => ({
        ...part,
        position: [
          part.position[0] + dx,
          part.position[1] + dy,
          part.position[2] + dz,
        ],
      })),
    },
  }
}

function withParts(asset: AssetSpec, parts: Part[]): AssetSpec {
  return { ...asset, geometry: { kind: "parts", parts } }
}

const SHELF: AssetSpec = {
  name: "Test shelf",
  category: "storage",
  mount: "floor",
  dims: { w: 800, d: 300, h: 100 },
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "box",
        name: "shelf",
        position: [0, 50, 0],
        size: [800, 100, 300],
      },
    ],
  },
}

describe("validateAsset", () => {
  it("accepts every test asset without warnings", () => {
    for (const asset of Object.values(TEST_ASSETS)) {
      const result = validateAsset(asset)
      expect(result.errors).toEqual([])
      expect(result.warnings).toEqual([])
      expect(result.ok).toBe(true)
    }
  })

  it("returns the asset's bounds", () => {
    expect(validateAsset(SOFA).bounds).toEqual({
      min: [-1100, 0, -475],
      max: [1100, 820, 475],
    })
  })

  it("rejects parts that fall short of dims, naming the extremes", () => {
    const result = validateAsset({ ...SOFA, dims: { ...SOFA.dims, w: 2250 } })
    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(
      "Parts span 2,200mm wide (x -1,100 to 1,100) but dims.w is 2,250mm (50mm short)."
    )
    expect(result.errors[0]).toContain("'base'")
  })

  it("rejects parts that overshoot dims", () => {
    const result = validateAsset({ ...SOFA, dims: { ...SOFA.dims, h: 700 } })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(
      "Parts span 820mm high (y 0 to 820) but dims.h is 700mm (120mm too tall)."
    )
    expect(result.errors[0]).toContain(
      "The outermost parts are 'leg front left' (y 0) and 'back' (y 820)."
    )
  })

  it("names the depth axis too", () => {
    const result = validateAsset({ ...SOFA, dims: { ...SOFA.dims, d: 900 } })
    expect(result.errors[0]).toContain("dims.d is 900mm (50mm too deep)")
  })

  it("allows up to DIMS_TOLERANCE_MM of difference", () => {
    expect(
      validateAsset({ ...SOFA, dims: { w: 2210, d: 940, h: 830 } }).ok
    ).toBe(true)
    expect(validateAsset({ ...SOFA, dims: { ...SOFA.dims, w: 2211 } }).ok).toBe(
      false
    )
  })

  it("rejects a footprint that isn't centred on the origin", () => {
    const result = validateAsset(shifted(COFFEE_TABLE, 50, 0, -30))
    expect(result.errors).toEqual([
      "The footprint isn't centred on the origin: parts span x -500 to 600, so its centre is at x 50. The origin must be the middle of the footprint — move every part by -50mm in x.",
      "The footprint isn't centred on the origin: parts span z -330 to 270, so its centre is at z -30. The origin must be the middle of the footprint — move every part by 30mm in z.",
    ])
  })

  it("rejects parts below the floor", () => {
    // Drop the first leg 30mm: its centre at y 160 puts its bottom at −30.
    const sunk = withParts(
      COFFEE_TABLE,
      COFFEE_TABLE.geometry.parts.map(
        (part): Part =>
          part.name === "leg front left"
            ? { ...part, position: [part.position[0], 160, part.position[2]] }
            : part
      )
    )
    const result = validateAsset(sunk)
    expect(result.errors).toContain(
      "Part 'leg front left' goes 30mm below the floor (its bottom is at y -30). Nothing may go below y 0 — raise it by 30mm."
    )
  })

  it("rejects a floor item that doesn't touch the floor", () => {
    const result = validateAsset(shifted(COFFEE_TABLE, 0, 40, 0))
    expect(result.errors).toEqual([
      "Nothing touches the floor: the lowest part, 'leg front left', starts at y 40. A floor-standing item needs its lowest part at y 0 — move every part down by 40mm.",
    ])
  })

  it("says the same for a floating rug", () => {
    const result = validateAsset(shifted(TEST_ASSETS.rug, 0, 5, 0))
    expect(result.errors[0]).toContain(
      "A floor covering needs its lowest part at y 0"
    )
  })

  it("only warns when a wall item doesn't start at y 0", () => {
    const result = validateAsset(shifted(WALL_TV, 0, 120, 0))
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([
      "The lowest part, 'screen', starts at y 120, not 0. A placement's elevation is measured to y 0, so this item will hang 120mm higher than its elevation; move every part down by 120mm.",
    ])
  })

  it("rejects a rounded box whose radius is more than half its smallest side", () => {
    const result = validateAsset(
      withParts(SHELF, [
        {
          shape: "roundedBox",
          name: "shelf",
          position: [0, 50, 0],
          size: [800, 100, 300],
          radius: 60,
        },
      ])
    )
    expect(result.errors).toEqual([
      "Part 'shelf' has an edge radius of 60mm but its smallest side is 100mm; the radius can be at most 50mm (half the smallest side).",
    ])
  })

  it("rejects a self-intersecting extrude profile", () => {
    const result = validateAsset(
      withParts(SHELF, [
        {
          shape: "extrude",
          name: "shelf",
          axis: "y",
          position: [0, 50, 0],
          depth: 100,
          profile: [
            [-400, -150],
            [400, 150],
            [400, -150],
            [-400, 150],
          ],
        },
      ])
    )
    expect(result.errors).toEqual([
      "Part 'shelf' has a self-intersecting profile (its outline crosses itself). List the profile points in order around the shape, without repeating the first point at the end.",
    ])
  })

  it("rejects an extrude profile with no area", () => {
    const result = validateAsset(
      withParts(SHELF, [
        SHELF.geometry.parts[0]!,
        {
          shape: "extrude",
          name: "edge",
          axis: "y",
          position: [0, 50, 0],
          depth: 100,
          profile: [
            [-400, 0],
            [0, 0],
            [400, 0],
          ],
        },
      ])
    )
    expect(result.errors).toEqual([
      "Part 'edge' has a profile with no area (all its points lie on a line).",
    ])
  })

  it("rejects a cylinder with no radius", () => {
    const result = validateAsset(
      withParts(SHELF, [
        SHELF.geometry.parts[0]!,
        {
          shape: "cylinder",
          name: "rod",
          position: [0, 50, 0],
          radiusTop: 0,
          radiusBottom: 0,
          height: 100,
        },
      ])
    )
    expect(result.errors).toEqual([
      "Part 'rod' is a cylinder with zero radius at both ends, so it is invisible. Give radiusTop and/or radiusBottom a size.",
    ])
  })

  it("warns about duplicate part names without failing", () => {
    const result = validateAsset(
      withParts(
        COFFEE_TABLE,
        COFFEE_TABLE.geometry.parts.map((part) =>
          part.name.startsWith("leg") ? { ...part, name: "leg" } : part
        )
      )
    )
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([
      "4 parts are called 'leg'. Give each part a unique name (e.g. 'leg left', 'leg right') so problems can point at the right one.",
    ])
  })
})
