import { describe, expect, it } from "vitest"

import { assetFootprint } from "../../src/assets"
import { COFFEE_TABLE, DINING_TABLE, PENDANT_LAMP } from "../../src/fixtures"
import { area, isClockwiseOnPlan } from "../../src/geometry"
import type { AssetSpec, Part } from "../../src/schema"

const box = (
  name: string,
  [x, z]: [number, number],
  [w, d]: [number, number],
  h = 400
): Part => ({
  shape: "box",
  name,
  position: [x, h / 2, z],
  size: [w, h, d],
})

const asset = (...parts: Part[]): Pick<AssetSpec, "geometry"> => ({
  geometry: { kind: "parts", parts },
})

describe("assetFootprint", () => {
  it("is the top's rectangle for a table whose legs sit under it", () => {
    expect(assetFootprint(COFFEE_TABLE)).toEqual([
      [
        [-550, -300],
        [550, -300],
        [550, 300],
        [-550, 300],
      ],
    ])
  })

  it("keeps the L of an L-shaped sofa", () => {
    const corner = asset(
      box("long seat", [0, 0], [2400, 900]),
      box("chaise", [750, 800], [900, 900])
    )
    const [outline, ...others] = assetFootprint(corner)
    expect(others).toEqual([])
    expect(outline).toHaveLength(6)
    // The chaise overlaps the seat by 100mm; the union counts that once.
    expect(area(outline!)).toBe(2400 * 900 + 900 * 900 - 900 * 100)
  })

  it("simplifies round parts to a few whole-mm points", () => {
    const [outline] = assetFootprint(PENDANT_LAMP)
    expect(outline!.length).toBeGreaterThanOrEqual(8)
    expect(outline!.length).toBeLessThanOrEqual(16)
    for (const [x, z] of outline!) {
      expect(Number.isInteger(x) && Number.isInteger(z)).toBe(true)
      // The shade (r 200) is a circumscribed 16-gon: corners at r / cos(π/16).
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(205)
      expect(Math.hypot(x, z)).toBeGreaterThan(180)
    }
  })

  it("returns separate pieces largest first, clockwise on the plan", () => {
    const pair = asset(
      box("small", [-1000, 0], [200, 200]),
      box("big", [1000, 0], [600, 400])
    )
    const rings = assetFootprint(pair)
    expect(rings.map((ring) => area(ring))).toEqual([240_000, 40_000])
    expect(rings.every((ring) => isClockwiseOnPlan(ring))).toBe(true)
  })

  it("drops holes, keeping only the outer outline", () => {
    const frame = asset(
      box("front", [0, 450], [1000, 100]),
      box("back", [0, -450], [1000, 100]),
      box("left", [-450, 0], [100, 1000]),
      box("right", [450, 0], [100, 1000])
    )
    expect(assetFootprint(frame)).toEqual([
      [
        [-500, -500],
        [500, -500],
        [500, 500],
        [-500, 500],
      ],
    ])
  })

  it("matches the dining table's overall size", () => {
    const [outline] = assetFootprint(DINING_TABLE)
    const xs = outline!.map(([x]) => x)
    const zs = outline!.map(([, z]) => z)
    expect(Math.max(...xs) - Math.min(...xs)).toBe(DINING_TABLE.dims.w)
    expect(Math.max(...zs) - Math.min(...zs)).toBe(DINING_TABLE.dims.d)
  })
})
