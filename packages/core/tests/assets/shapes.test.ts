import { describe, expect, it } from "vitest"

import {
  annularSector,
  arcAngles,
  BEVEL_SEGMENTS,
  cleanProfile,
  extrudeRings,
  latheArc,
  offsetPolygon,
  onArc,
  revolvePoint,
  sinusoidRange,
  torusArc,
} from "../../src/assets"
import { bounds, isSimplePolygon, signedArea } from "../../src/geometry"

const SQUARE: [number, number][] = [
  [-100, -100],
  [100, -100],
  [100, 100],
  [-100, 100],
]

describe("revolve angles", () => {
  it("puts 0° at +z (the front) and 90° at +x", () => {
    const front = revolvePoint(0, 100, 5)
    const right = revolvePoint(90, 100, 5)
    expect(front[0]).toBeCloseTo(0)
    expect(front[2]).toBeCloseTo(100)
    expect(right[0]).toBeCloseTo(100)
    expect(right[2]).toBeCloseTo(0)
    expect(front[1]).toBe(5)
  })

  it("reads lathe and torus arcs, treating a full turn as no arc", () => {
    expect(latheArc({ arc: [45, 270] })).toEqual({ start: 45, length: 270 })
    expect(latheArc({ arc: [10, 360] })).toBeUndefined()
    expect(latheArc({})).toBeUndefined()
    expect(torusArc({ arc: 180 })).toEqual({ start: 0, length: 180 })
    expect(torusArc({ arc: 360 })).toBeUndefined()
    expect(torusArc({})).toBeUndefined()
  })

  it("knows which angles are on an arc, wrapping past 360", () => {
    const arc = { start: 300, length: 120 }
    expect(onArc(330, arc)).toBe(true)
    expect(onArc(0, arc)).toBe(true)
    expect(onArc(60, arc)).toBe(true)
    expect(onArc(-30, arc)).toBe(true)
    expect(onArc(90, arc)).toBe(false)
    expect(onArc(299, arc)).toBe(false)
  })

  it("spaces arc angles evenly with both ends included", () => {
    expect(arcAngles({ start: 0, length: 90 }, 30)).toEqual([0, 30, 60, 90])
    expect(arcAngles({ start: 10, length: 20 }, 30)).toEqual([10, 30])
  })
})

describe("sinusoidRange", () => {
  it("is ± the amplitude over a full turn", () => {
    expect(sinusoidRange(3, 4)).toEqual({ min: -5, max: 5 })
  })

  it("matches dense sampling on partial arcs", () => {
    const cases: [number, number, number, number][] = [
      [1, 0, 0, 90],
      [0, 1, 45, 270],
      [0.6, -0.8, 200, 100],
      [-0.3, 0.2, 350, 30],
    ]
    for (const [a, b, start, length] of cases) {
      const range = sinusoidRange(a, b, { start, length })
      let min = Infinity
      let max = -Infinity
      for (let i = 0; i <= 3600; i++) {
        const phi = ((start + (length * i) / 3600) * Math.PI) / 180
        const value = a * Math.sin(phi) + b * Math.cos(phi)
        min = Math.min(min, value)
        max = Math.max(max, value)
      }
      expect(range.min).toBeCloseTo(min, 6)
      expect(range.max).toBeCloseTo(max, 6)
    }
  })
})

describe("cleanProfile", () => {
  it("drops repeated neighbours and a repeated closing point", () => {
    expect(
      cleanProfile([
        [0, 0],
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0],
      ])
    ).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ])
  })
})

describe("offsetPolygon", () => {
  it("insets and grows a square by the distance on every side", () => {
    expect(bounds(offsetPolygon(SQUARE, -20))).toEqual({
      minX: -80,
      minZ: -80,
      maxX: 80,
      maxZ: 80,
    })
    expect(bounds(offsetPolygon(SQUARE, 20))).toEqual({
      minX: -120,
      minZ: -120,
      maxX: 120,
      maxZ: 120,
    })
  })

  it("works the same for either winding", () => {
    const reversed = [...SQUARE].reverse()
    expect(bounds(offsetPolygon(reversed, -20))).toEqual(
      bounds(offsetPolygon(SQUARE, -20))
    )
  })

  it("moves every edge of an L by exactly the distance", () => {
    const L: [number, number][] = [
      [0, 0],
      [400, 0],
      [400, 100],
      [100, 100],
      [100, 300],
      [0, 300],
    ]
    const inset = offsetPolygon(L, -10)
    expect(inset).toEqual([
      [10, 10],
      [390, 10],
      [390, 90],
      [90, 90],
      [90, 290],
      [10, 290],
    ])
    expect(isSimplePolygon(inset)).toBe(true)
  })

  it("caps the miter of very sharp corners", () => {
    const spike: [number, number][] = [
      [0, 0],
      [1000, 20],
      [0, 40],
    ]
    const grown = offsetPolygon(spike, 10)
    const tip = grown[1]!
    expect(Math.hypot(tip[0] - 1000, tip[1] - 20)).toBeLessThanOrEqual(40.01)
  })
})

describe("extrudeRings", () => {
  const part = { profile: SQUARE, depth: 300 }

  it("is the profile at both ends without a bevel", () => {
    const rings = extrudeRings(part)
    expect(rings.map((r) => r.e)).toEqual([-150, 150])
    expect(rings[0]!.points).toEqual(SQUARE)
  })

  it("rounds both ends with a quarter round, keeping the outer size", () => {
    const rings = extrudeRings({ ...part, bevel: 30 })
    expect(rings).toHaveLength(2 * (BEVEL_SEGMENTS + 1))
    const ends = [rings[0]!, rings[rings.length - 1]!]
    for (const end of ends) {
      // End faces: the profile inset by the bevel, at ±depth/2.
      expect(Math.abs(end.e)).toBeCloseTo(150)
      expect(bounds(end.points).maxX).toBeCloseTo(70)
    }
    // The widest rings are the full profile, `bevel` in from each end.
    const full = rings.filter(
      (r) => Math.abs(bounds(r.points).maxX - 100) < 1e-9
    )
    expect(full.map((r) => r.e)).toEqual([-120, 120])
    // Monotonic along the axis; every ring keeps the profile's winding.
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i]!.e).toBeGreaterThan(rings[i - 1]!.e)
      expect(Math.sign(signedArea(rings[i]!.points))).toBe(
        Math.sign(signedArea(SQUARE))
      )
    }
  })

  it("meets in the middle when the bevel is half the depth", () => {
    const wide: [number, number][] = SQUARE.map(([u, v]) => [u * 4, v * 4])
    const rings = extrudeRings({ profile: wide, depth: 300, bevel: 150 })
    const middle = rings.filter((r) => Math.abs(r.e) < 1e-9)
    expect(middle).toHaveLength(1)
    expect(rings).toHaveLength(2 * BEVEL_SEGMENTS + 1)
  })

  it("shrinks a bevel too big for the profile so no ring turns inside out", () => {
    const rings = extrudeRings({ ...part, bevel: 140 })
    for (const ring of rings) {
      expect(Math.sign(signedArea(ring.points))).not.toBe(
        -Math.sign(signedArea(SQUARE))
      )
    }
    expect(bounds(rings[0]!.points).maxX).toBeCloseTo(0)
  })
})

describe("annularSector", () => {
  it("traces a band that contains the arc, with chords inside", () => {
    const band = annularSector({ start: 45, length: 270 }, 300, 400)
    expect(isSimplePolygon(band)).toBe(true)
    // Every point on the arc between the radii lies inside the polygon's
    // bounds, and the open front (around 0°) is left out.
    const b = bounds(band)
    expect(b.minZ).toBeLessThan(-399.999)
    expect(b.minX).toBeLessThan(-399.999)
    expect(b.maxX).toBeGreaterThan(399.999)
    expect(b.maxZ).toBeLessThan(400 * Math.cos(Math.PI / 4) + 1)
  })

  it("closes at the centre when the inner radius is 0", () => {
    const sector = annularSector({ start: 0, length: 90 }, 0, 100)
    expect(sector[sector.length - 1]).toEqual([0, 0])
  })
})
