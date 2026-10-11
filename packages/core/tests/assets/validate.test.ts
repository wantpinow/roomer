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

describe("validateAsset: part vocabulary v2", () => {
  const SLAB: AssetSpec = {
    name: "Stadium bench top",
    category: "chair",
    mount: "floor",
    dims: { w: 1500, d: 400, h: 40 },
    geometry: {
      kind: "parts",
      parts: [
        {
          shape: "roundedBox",
          name: "top",
          position: [0, 20, 0],
          size: [1500, 40, 400],
          radius: 200,
          edges: "vertical",
        },
      ],
    },
  }

  it("lets vertical edges round up to half the smaller of width and depth", () => {
    expect(validateAsset(SLAB).errors).toEqual([])
    const tooRound = withParts(SLAB, [
      { ...SLAB.geometry.parts[0]!, radius: 201 } as Part,
    ])
    expect(validateAsset(tooRound).errors).toEqual([
      "Part 'top' has an edge radius of 201mm but it is only 400mm across (width or depth); with edges 'vertical' the radius can be at most 200mm (half the smaller of width and depth — exactly that makes a stadium).",
    ])
    // Rounding every edge is still limited by the 40mm height.
    const allEdges = withParts(SLAB, [
      { ...SLAB.geometry.parts[0]!, edges: "all" } as Part,
    ])
    expect(validateAsset(allEdges).ok).toBe(false)
  })

  const CUSHION: AssetSpec = {
    name: "Cushion",
    category: "decor",
    mount: "floor",
    dims: { w: 600, d: 500, h: 200 },
    geometry: {
      kind: "parts",
      parts: [
        {
          shape: "extrude",
          name: "cushion",
          axis: "z",
          position: [0, 100, 0],
          profile: [
            [-300, -100],
            [300, -100],
            [300, 100],
            [-300, 100],
          ],
          depth: 500,
          bevel: 60,
        },
      ],
    },
  }

  it("accepts a bevel that fits and rejects one that doesn't", () => {
    expect(validateAsset(CUSHION).errors).toEqual([])
    const cushion = CUSHION.geometry.parts[0]! as Extract<
      Part,
      { shape: "extrude" }
    >
    const deep = withParts(CUSHION, [{ ...cushion, bevel: 260 }])
    expect(validateAsset(deep).errors).toEqual([
      "Part 'cushion': its bevel of 260mm is more than half its depth (500mm); use at most 250mm.",
    ])
    const narrow = withParts(CUSHION, [{ ...cushion, bevel: 120 }])
    expect(validateAsset(narrow).errors).toEqual([
      "Part 'cushion': its profile is too narrow somewhere for a bevel of 120mm (inset by the bevel, the outline folds over itself); use a bevel under half the profile's narrowest width.",
    ])
  })

  it("rejects a torus whose tube is fatter than its radius", () => {
    const ring: AssetSpec = {
      name: "Ring",
      category: "decor",
      mount: "floor",
      dims: { w: 300, d: 300, h: 200 },
      geometry: {
        kind: "parts",
        parts: [
          {
            shape: "torus",
            name: "ring",
            position: [0, 100, 0],
            radius: 50,
            tube: 100,
          },
        ],
      },
    }
    expect(validateAsset(ring).errors).toContain(
      "Part 'ring' is a torus whose tube (100mm) is fatter than its ring radius (50mm), so it would pass through its own centre. Make tube at most radius."
    )
  })

  it("caps the expanded part count at 400", () => {
    const parts: Part[] = Array.from({ length: 7 }, (_, i) => ({
      shape: "box",
      name: `row ${i}`,
      position: [-630, 50, i * 10],
      size: [10, 100, 10],
      repeat: { count: 64, step: [20, 0, 0] },
    }))
    const result = validateAsset(withParts(SHELF, parts))
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      "The parts expand to 448 with their repeats; the most an asset may have is 400. Use fewer or wider repeated copies (e.g. a slat every 40mm instead of every 25mm).",
    ])
  })

  it("names repeated copies in errors and doesn't call them duplicates", () => {
    const parts: Part[] = [
      {
        shape: "box",
        name: "slat",
        position: [-350, 50, 0],
        size: [100, 100, 300],
        repeat: { count: 8, step: [100, -1, 0] },
      },
    ]
    const result = validateAsset(withParts(SHELF, parts))
    expect(result.warnings.some((w) => w.includes("parts are called"))).toBe(
      false
    )
    expect(result.errors).toContain(
      "Part 'slat #8' goes 7mm below the floor (its bottom is at y -7). Nothing may go below y 0 — raise it by 7mm."
    )
  })

  it("only warns when a part dips up to 3mm below the floor", () => {
    const dipped = withParts(SHELF, [
      { ...SHELF.geometry.parts[0]!, position: [0, 48, 0] },
    ])
    const result = validateAsset(dipped)
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([
      "Part 'shelf' dips 2mm below the floor (its bottom is at y -2); harmless, but raise it by 2mm to sit exactly on y 0.",
    ])
  })
})

describe("validateAsset: clearance zones", () => {
  const zoned = (rect: [number, number, number, number], name = "legroom") =>
    validateAsset({
      ...SOFA,
      clearanceZones: [{ name, rect }],
    })

  it("accepts a zone that touches the item's front", () => {
    const result = zoned([-1100, 475, 1100, 925])
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it("rejects an empty, tiny or huge rectangle", () => {
    expect(zoned([0, 475, 0, 900]).errors).toEqual([
      "Clearance zone 'legroom' [0, 475, 0, 900] is empty: rect is [minX, minZ, maxX, maxZ], so maxX must be more than minX and maxZ more than minZ.",
    ])
    expect(zoned([-1100, 475, 1100, 525]).errors[0]).toContain(
      "is only 2,200mm × 50mm"
    )
    expect(zoned([-3000, 475, 3000, 925]).errors[0]).toContain(
      "is 6,000mm × 450mm; at most 4,000mm on a side"
    )
  })

  it("rejects a zone over the item's own footprint", () => {
    const result = zoned([-1100, 300, 1100, 750])
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(
      /^Clearance zone 'legroom' \[-1,100, 300, 1,100, 750\] overlaps the item's own part '.+' by 175mm\./
    )
  })

  it("warns about a zone that doesn't touch the item", () => {
    const result = zoned([-1100, 600, 1100, 1000])
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([
      "Clearance zone 'legroom' [-1,100, 600, 1,100, 1,000] doesn't touch the item (it is more than 50mm from every part). Clearance usually starts right at the item's edge.",
    ])
  })
})
