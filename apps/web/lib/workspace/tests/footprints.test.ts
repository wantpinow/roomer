import { describe, expect, it } from "vitest"

import { TEST_ASSETS } from "@roomer/core/fixtures"
import type { Placement } from "@roomer/core/schema"

import { planFootprints, svgPoints } from "../footprints"

const table: Placement = {
  id: "table",
  assetId: "t",
  x: 1000,
  z: 2000,
  facing: 180,
  elevation: 0,
}

describe("planFootprints", () => {
  it("outlines an item at its placement, in mm", () => {
    const [footprint] = planFootprints([table], { t: TEST_ASSETS.coffeeTable })
    const xs = footprint!.outline.map(([x]) => x)
    const zs = footprint!.outline.map(([, z]) => z)
    const { w, d } = TEST_ASSETS.coffeeTable.dims
    expect(Math.min(...xs)).toBeCloseTo(1000 - w / 2)
    expect(Math.max(...xs)).toBeCloseTo(1000 + w / 2)
    expect(Math.min(...zs)).toBeCloseTo(2000 - d / 2)
    expect(Math.max(...zs)).toBeCloseTo(2000 + d / 2)
    expect(footprint!.mount).toBe("floor")
    expect(footprint!.parts.length).toBe(
      TEST_ASSETS.coffeeTable.geometry.parts.length
    )
  })

  it("turns with the facing", () => {
    const [footprint] = planFootprints([{ ...table, facing: 90 }], {
      t: TEST_ASSETS.coffeeTable,
    })
    const xs = footprint!.outline.map(([x]) => x)
    const { d } = TEST_ASSETS.coffeeTable.dims
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(d)
  })

  it("skips placements whose asset isn't loaded", () => {
    expect(planFootprints([table], {})).toEqual([])
  })
})

describe("svgPoints", () => {
  it("joins points for a polygon", () => {
    expect(
      svgPoints([
        [0, 0],
        [10, 5],
      ])
    ).toBe("0,0 10,5")
  })
})
