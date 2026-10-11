import { describe, expect, it } from "vitest"

import { rectPolygon, signedArea, type Point } from "../../src/geometry"
import {
  clipConvex,
  closestBetween,
  closestPoints,
  difference,
  intersect,
  isConvex,
  minWidth,
  polygonArea,
  project,
  sectorPolygon,
  union,
} from "../../src/lint/polygons"

const SQUARE = rectPolygon(0, 0, 100, 100)
const L_SHAPE: Point[] = [
  [0, 0],
  [300, 0],
  [300, 100],
  [100, 100],
  [100, 300],
  [0, 300],
]

describe("isConvex", () => {
  it("accepts rectangles and rejects an L", () => {
    expect(isConvex(SQUARE)).toBe(true)
    expect(isConvex(L_SHAPE)).toBe(false)
    expect(
      isConvex([
        [0, 0],
        [1, 1],
      ] as Point[])
    ).toBe(false)
  })
})

describe("clipConvex", () => {
  it("returns the overlap of two rectangles", () => {
    const region = clipConvex(SQUARE, rectPolygon(60, 20, 160, 50))
    expect(polygonArea(region)).toBeCloseTo(40 * 30)
  })

  it("returns nothing when they only touch or are apart", () => {
    expect(clipConvex(SQUARE, rectPolygon(100, 0, 200, 100))).toEqual([])
    expect(clipConvex(SQUARE, rectPolygon(150, 0, 200, 100))).toEqual([])
  })

  it("works whichever way the clip polygon winds", () => {
    const clip = rectPolygon(50, 50, 150, 150).reverse()
    expect(polygonArea(clipConvex(SQUARE, clip))).toBeCloseTo(2500)
  })
})

describe("intersect", () => {
  it("splits a non-convex overlap into its separate pieces", () => {
    // A U shape cut by a bar across both arms gives two pieces.
    const u: Point[] = [
      [0, 0],
      [100, 0],
      [100, 200],
      [200, 200],
      [200, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ]
    const regions = intersect(u, rectPolygon(-50, 50, 350, 100))
    expect(regions).toHaveLength(2)
    expect(regions.map(polygonArea)).toEqual([5000, 5000])
  })
})

describe("difference and union", () => {
  it("cuts away what overlaps", () => {
    const [rest] = difference(SQUARE, [rectPolygon(50, -10, 200, 200)])
    expect(polygonArea(rest!)).toBeCloseTo(5000)
  })

  it("merges overlapping outlines into one with no holes", () => {
    const merged = union([SQUARE, rectPolygon(50, 0, 150, 100)])
    expect(merged).toHaveLength(1)
    expect(polygonArea(merged[0]![0]!)).toBeCloseTo(15000)
  })
})

describe("minWidth", () => {
  it("is the short side of a rectangle, even a long sliver", () => {
    expect(minWidth(rectPolygon(0, 0, 2000, 4))).toBeCloseTo(4)
  })

  it("measures a rotated rectangle across, not by its bounding box", () => {
    const c = Math.SQRT1_2
    const rotated: Point[] = [
      [0, 0],
      [1000 * c, 1000 * c],
      [1000 * c - 10 * c, 1000 * c + 10 * c],
      [-10 * c, 10 * c],
    ]
    expect(minWidth(rotated)).toBeCloseTo(10)
  })

  it("is 0 for fewer than three distinct points", () => {
    expect(
      minWidth([
        [0, 0],
        [5, 5],
      ] as Point[])
    ).toBe(0)
  })
})

describe("project", () => {
  it("gives the extent along a direction", () => {
    expect(project(SQUARE, [1, 0])).toEqual([0, 100])
    expect(project(SQUARE, [0, -1])).toEqual([-100, 0])
  })
})

describe("closestPoints / closestBetween", () => {
  it("finds the gap between parallel segments", () => {
    const found = closestPoints([0, 0], [100, 0], [50, 30], [150, 30])
    expect(found.distance).toBeCloseTo(30)
  })

  it("is 0 where segments cross", () => {
    const found = closestPoints([0, 0], [100, 100], [0, 100], [100, 0])
    expect(found.distance).toBe(0)
    expect(found.p).toEqual([50, 50])
  })

  it("finds the gap between two outlines", () => {
    const found = closestBetween(SQUARE, rectPolygon(130, 0, 200, 100))
    expect(found?.distance).toBeCloseTo(30)
  })
})

describe("sectorPolygon", () => {
  it("is a clockwise quarter disc of the right area", () => {
    const sector = sectorPolygon([0, 0], [1, 0], [0, 1], 1000, 64)
    expect(signedArea(sector)).toBeGreaterThan(0)
    expect(polygonArea(sector)).toBeCloseTo((Math.PI * 1000 ** 2) / 4, -3)
  })
})
