import { describe, expect, it } from "vitest"

import { SOFA } from "../../src/fixtures"
import { bounds, signedArea } from "../../src/geometry"
import { placementFootprintBounds, worldShapes } from "../../src/placement"
import type { AssetSpec } from "../../src/schema"

const LOPSIDED: AssetSpec = {
  name: "Lopsided bench",
  category: "other",
  mount: "floor",
  dims: { w: 2000, d: 400, h: 450 },
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "box",
        name: "seat",
        position: [-100, 225, 0],
        size: [2000, 450, 400],
      },
    ],
  },
}

describe("worldShapes", () => {
  const pose = { x: 1000, z: 2000, facing: 90, elevation: 100 }

  it("returns one room-space shape per part, lifted by the elevation", () => {
    const shapes = worldShapes(pose, SOFA)
    expect(shapes.map((s) => s.part)).toEqual(
      SOFA.geometry.parts.map((p) => p.name)
    )
    const base = shapes.find((s) => s.part === "base")!
    expect([base.y0, base.y1]).toEqual([160, 540])
    for (const shape of shapes) {
      expect(signedArea(shape.footprint)).toBeGreaterThan(0)
    }
  })

  it("turns the footprint with the facing", () => {
    // Facing right: the 2,200mm width runs down the page, depth across.
    expect(placementFootprintBounds(pose, SOFA)).toEqual({
      minX: 1000 - 475,
      maxX: 1000 + 475,
      minZ: 2000 - 1100,
      maxZ: 2000 + 1100,
    })
  })

  it("mirrors left/right and keeps outlines clockwise", () => {
    const plain = worldShapes(
      { x: 0, z: 0, facing: 180, elevation: 0 },
      LOPSIDED
    )
    const mirrored = worldShapes(
      { x: 0, z: 0, facing: 180, elevation: 0, mirrored: true },
      LOPSIDED
    )
    expect(bounds(plain[0]!.footprint)).toMatchObject({
      minX: -1100,
      maxX: 900,
    })
    expect(bounds(mirrored[0]!.footprint)).toMatchObject({
      minX: -900,
      maxX: 1100,
    })
    expect(signedArea(mirrored[0]!.footprint)).toBeGreaterThan(0)
  })
})
