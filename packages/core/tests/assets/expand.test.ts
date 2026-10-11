import { describe, expect, it } from "vitest"

import {
  assetCollisionShapes,
  assetLocalBounds,
  expandedPartCount,
  expandParts,
  partCopies,
} from "../../src/assets"
import { worldShapes } from "../../src/placement"
import type { AssetSpec, Part } from "../../src/schema"

const slat: Part = {
  shape: "box",
  name: "slat",
  position: [-100, 300, 0],
  size: [20, 600, 20],
  tone: "dark",
  repeat: { count: 5, step: [50, 0, 0] },
}

const top: Part = {
  shape: "box",
  name: "top",
  position: [0, 620, 0],
  size: [400, 40, 100],
}

const CABINET: AssetSpec = {
  name: "Tambour cabinet",
  category: "storage",
  mount: "floor",
  dims: { w: 400, d: 100, h: 640 },
  geometry: { kind: "parts", parts: [slat, top] },
}

describe("expandParts", () => {
  it("writes out each copy at position + i × step, named #1…#n", () => {
    const copies = partCopies(slat)
    expect(copies.map((p) => p.name)).toEqual([
      "slat #1",
      "slat #2",
      "slat #3",
      "slat #4",
      "slat #5",
    ])
    expect(copies.map((p) => p.position)).toEqual([
      [-100, 300, 0],
      [-50, 300, 0],
      [0, 300, 0],
      [50, 300, 0],
      [100, 300, 0],
    ])
  })

  it("keeps everything else and drops the repeat from the copies", () => {
    for (const copy of partCopies(slat)) {
      expect(copy).not.toHaveProperty("repeat")
      expect(copy).toMatchObject({ shape: "box", size: [20, 600, 20] })
      expect(copy.tone).toBe("dark")
    }
  })

  it("steps in any direction, including diagonally and downwards", () => {
    const copies = partCopies({
      ...slat,
      repeat: { count: 3, step: [10, -20, 30] },
    })
    expect(copies.map((p) => p.position)).toEqual([
      [-100, 300, 0],
      [-90, 280, 30],
      [-80, 260, 60],
    ])
  })

  it("leaves parts without a repeat untouched and keeps the order", () => {
    const parts = expandParts([top, slat, top])
    expect(parts[0]).toBe(top)
    expect(parts.map((p) => p.name)).toEqual([
      "top",
      "slat #1",
      "slat #2",
      "slat #3",
      "slat #4",
      "slat #5",
      "top",
    ])
  })

  it("counts the expanded parts without building them", () => {
    expect(expandedPartCount([top, slat, top])).toBe(7)
    expect(expandedPartCount([])).toBe(0)
  })
})

describe("every consumer sees the repeats", () => {
  it("bounds span all the copies", () => {
    const box = assetLocalBounds(CABINET)
    expect(box.min[0]).toBe(-200)
    expect(box.max[0]).toBe(200)
    // The slats alone: −110…110.
    const slats = assetLocalBounds({
      geometry: { kind: "parts", parts: [slat] },
    })
    expect(slats.min[0]).toBe(-110)
    expect(slats.max[0]).toBe(110)
  })

  it("collision and world shapes get one shape per copy", () => {
    expect(assetCollisionShapes(CABINET).map((s) => s.part)).toEqual([
      "slat #1",
      "slat #2",
      "slat #3",
      "slat #4",
      "slat #5",
      "top",
    ])
    const world = worldShapes(
      { x: 1000, z: 1000, facing: 180, elevation: 0 },
      CABINET
    )
    expect(world).toHaveLength(6)
    const xs = world.slice(0, 5).map((s) => {
      const sum = s.footprint.reduce((acc, [x]) => acc + x, 0)
      return Math.round(sum / s.footprint.length)
    })
    expect(xs).toEqual([900, 950, 1000, 1050, 1100])
  })
})
