import { describe, expect, it } from "vitest"

import {
  assetCollisionShapes,
  assetLocalBounds,
  partCollisionShape,
  partLocalBounds,
} from "../../src/assets"
import { TEST_ASSETS } from "../../src/fixtures"
import { bounds, signedArea, type Point } from "../../src/geometry"
import type { ExtrudePart, Part } from "../../src/schema"

const L_PROFILE: [number, number][] = [
  [-500, -300],
  [500, -300],
  [500, 0],
  [0, 0],
  [0, 300],
  [-500, 300],
]
const L_AREA = 1000 * 300 + 500 * 300

const sameOutline = (actual: readonly Point[], expected: readonly Point[]) => {
  expect(actual).toHaveLength(expected.length)
  const key = (p: Point) => `${Math.round(p[0])},${Math.round(p[1])}`
  expect(new Set(actual.map(key))).toEqual(new Set(expected.map(key)))
}

describe("partCollisionShape", () => {
  it("uses the plan rectangle of an upright box, with its height range", () => {
    const shape = partCollisionShape({
      shape: "box",
      name: "top",
      position: [0, 400, 100],
      size: [1100, 40, 600],
    })
    expect(shape.part).toBe("top")
    expect(shape.y0).toBe(380)
    expect(shape.y1).toBe(420)
    sameOutline(shape.footprint, [
      [-550, -200],
      [550, -200],
      [550, 400],
      [-550, 400],
    ])
    expect(signedArea(shape.footprint)).toBe(1100 * 600)
  })

  it("turns a box's footprint with its y rotation", () => {
    const shape = partCollisionShape({
      shape: "box",
      name: "bench",
      position: [0, 0, 0],
      size: [1000, 100, 100],
      rotation: [0, 30, 0],
    })
    expect(shape.footprint).toHaveLength(4)
    expect(signedArea(shape.footprint)).toBeCloseTo(1000 * 100, 2)
  })

  it("keeps an upright extrude's real (L-shaped) outline", () => {
    const part: ExtrudePart = {
      shape: "extrude",
      name: "seat",
      axis: "y",
      position: [100, 200, 0],
      depth: 400,
      profile: L_PROFILE,
    }
    const shape = partCollisionShape(part)
    expect(shape.footprint).toHaveLength(6)
    expect(signedArea(shape.footprint)).toBe(L_AREA)
    expect(bounds(shape.footprint)).toEqual({
      minX: -400,
      maxX: 600,
      minZ: -300,
      maxZ: 300,
    })
    expect([shape.y0, shape.y1]).toEqual([0, 400])
  })

  it("normalises an anticlockwise extrude profile to clockwise", () => {
    const shape = partCollisionShape({
      shape: "extrude",
      name: "seat",
      axis: "y",
      position: [0, 200, 0],
      depth: 400,
      profile: [...L_PROFILE].reverse(),
    })
    expect(signedArea(shape.footprint)).toBe(L_AREA)
  })

  it("turns an upright extrude's outline with its y rotation", () => {
    // Ry(90): local (u, v) → (v, −u).
    const shape = partCollisionShape({
      shape: "extrude",
      name: "seat",
      axis: "y",
      position: [0, 200, 0],
      depth: 400,
      profile: L_PROFILE,
      rotation: [0, 90, 0],
    })
    sameOutline(
      shape.footprint,
      L_PROFILE.map(([u, v]) => [v, -u])
    )
    expect(signedArea(shape.footprint)).toBe(L_AREA)
  })

  it("uses the plan rectangle of a sideways extrude", () => {
    const shape = partCollisionShape({
      shape: "extrude",
      name: "arm",
      axis: "x",
      position: [0, 0, 0],
      depth: 100,
      profile: [
        [0, 0],
        [400, 0],
        [0, 300],
      ],
    })
    sameOutline(shape.footprint, [
      [-50, 0],
      [50, 0],
      [50, 400],
      [-50, 400],
    ])
  })

  it("makes upright round parts a 16-gon flush with their bounds", () => {
    const parts: Part[] = [
      {
        shape: "cylinder",
        name: "shade",
        position: [10, 150, 20],
        radiusTop: 60,
        radiusBottom: 200,
        height: 300,
      },
      { shape: "sphere", name: "ball", position: [10, 200, 20], radius: 200 },
      {
        shape: "lathe",
        name: "vase",
        position: [10, 0, 20],
        profile: [
          [0, 0],
          [200, 0],
          [50, 400],
        ],
      },
    ]
    for (const part of parts) {
      const shape = partCollisionShape(part)
      expect(shape.footprint).toHaveLength(16)
      const box = bounds(shape.footprint)
      expect(box.minX).toBeCloseTo(-190, 6)
      expect(box.maxX).toBeCloseTo(210, 6)
      expect(box.minZ).toBeCloseTo(-180, 6)
      expect(box.maxZ).toBeCloseTo(220, 6)
      expect(signedArea(shape.footprint)).toBeGreaterThan(0)
    }
  })

  it("uses the rectangle under a cylinder lying on its side", () => {
    const shape = partCollisionShape({
      shape: "cylinder",
      name: "bolster",
      position: [0, 100, 0],
      radiusTop: 100,
      radiusBottom: 100,
      height: 800,
      rotation: [0, 0, 90],
    })
    sameOutline(shape.footprint, [
      [-400, -100],
      [400, -100],
      [400, 100],
      [-400, 100],
    ])
    expect([shape.y0, shape.y1]).toEqual([0, 200])
  })

  it("never pokes past the exact bounds of a tilted part", () => {
    const part: Part = {
      shape: "cylinder",
      name: "splayed leg",
      position: [0, 200, 0],
      radiusTop: 20,
      radiusBottom: 15,
      height: 400,
      rotation: [15, 0, 10],
    }
    const exact = partLocalBounds(part)
    const box = bounds(partCollisionShape(part).footprint)
    expect(box.minX).toBeCloseTo(exact.min[0], 6)
    expect(box.maxX).toBeCloseTo(exact.max[0], 6)
    expect(box.minZ).toBeCloseTo(exact.min[2], 6)
    expect(box.maxZ).toBeCloseTo(exact.max[2], 6)
  })
})

describe("assetCollisionShapes", () => {
  it("returns one shape per part whose footprints span the asset bounds", () => {
    for (const asset of Object.values(TEST_ASSETS)) {
      const shapes = assetCollisionShapes(asset)
      expect(shapes.map((s) => s.part)).toEqual(
        asset.geometry.parts.map((p) => p.name)
      )
      const plan = bounds(shapes.flatMap((s) => s.footprint))
      const exact = assetLocalBounds(asset)
      expect(plan.minX).toBeCloseTo(exact.min[0], 6)
      expect(plan.maxX).toBeCloseTo(exact.max[0], 6)
      expect(plan.minZ).toBeCloseTo(exact.min[2], 6)
      expect(plan.maxZ).toBeCloseTo(exact.max[2], 6)
      expect(Math.min(...shapes.map((s) => s.y0))).toBe(exact.min[1])
      expect(Math.max(...shapes.map((s) => s.y1))).toBe(exact.max[1])
    }
  })
})
