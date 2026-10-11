import { describe, expect, it } from "vitest"

import { FIXTURE_ROOM } from "../fixture-scene"
import { buildRoomShell, type ShellSolid } from "../room-geometry"
import { mergedSolidGeometry, solidGeometry } from "../solid-geometry"

function boundsMm(solid: ShellSolid) {
  const geometry = solidGeometry(solid)
  geometry.computeBoundingBox()
  const { min, max } = geometry.boundingBox!
  return [min.x, min.y, min.z, max.x, max.y, max.z].map(
    (v) => Math.round(v * 1000) || 0
  )
}

describe("solidGeometry", () => {
  it("stands a prism up between its heights, keeping plan x and z", () => {
    expect(
      boundsMm({
        kind: "prism",
        role: "obstacle",
        footprint: [
          [0, 1770],
          [120, 1770],
          [120, 2770],
          [0, 2770],
        ],
        y0: 0,
        y1: 2450,
      })
    ).toEqual([0, 0, 1770, 120, 2450, 2770])
  })

  it("places an upright cylinder at its plan centre", () => {
    expect(
      boundsMm({
        kind: "cylinder",
        role: "light",
        center: [1490, 2400],
        radius: 55,
        y0: 2425,
        y1: 2450,
      })
    ).toEqual([1435, 2425, 2345, 1545, 2450, 2455])
  })

  it("keeps prism faces winding outward whatever the footprint's winding", () => {
    const square = (reverse: boolean): ShellSolid => {
      const footprint: [number, number][] = [
        [0, 0],
        [1000, 0],
        [1000, 1000],
        [0, 1000],
      ]
      return {
        kind: "prism",
        role: "wall",
        footprint: reverse ? footprint.reverse() : footprint,
        y0: 0,
        y1: 1000,
      }
    }
    for (const reverse of [false, true]) {
      const position = solidGeometry(square(reverse)).getAttribute("position")
      let volume = 0
      for (let i = 0; i < position.count; i += 3) {
        const a = [position.getX(i), position.getY(i), position.getZ(i)]
        const b = [
          position.getX(i + 1),
          position.getY(i + 1),
          position.getZ(i + 1),
        ]
        const c = [
          position.getX(i + 2),
          position.getY(i + 2),
          position.getZ(i + 2),
        ]
        volume +=
          (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
            a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
            a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) /
          6
      }
      expect(volume).toBeCloseTo(1)
    }
  })
})

describe("mergedSolidGeometry", () => {
  it("merges a whole room's shell into one geometry", () => {
    const shell = buildRoomShell(FIXTURE_ROOM)
    const merged = mergedSolidGeometry(shell.solids)!
    merged.computeBoundingBox()
    const { min, max } = merged.boundingBox!
    expect(Math.round(min.x * 1000)).toBe(-100)
    expect(Math.round(max.z * 1000)).toBe(7880)
    expect(Math.round(max.y * 1000)).toBe(2510)
  })

  it("is null for no solids", () => {
    expect(mergedSolidGeometry([])).toBeNull()
  })
})
