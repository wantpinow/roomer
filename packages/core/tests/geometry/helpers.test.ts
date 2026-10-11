import { describe, expect, it } from "vitest"

import { LIVING_ROOM_CORNERS } from "../../src/fixtures"
import {
  bounds,
  circumscribedPolygon,
  clipToBounds,
  convexHull,
  eulerXYZMatrix,
  formatDegrees,
  formatMm,
  formatNumber,
  pointSegmentDistance,
  polygonCentroid,
  polygonSegmentDistance,
  rayPolygonHit,
  rotateEulerXYZ,
  segmentDistance,
  signedArea,
  type Point,
} from "../../src/geometry"

const closePoint = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 9))
}

describe("formatNumber / formatMm / formatDegrees", () => {
  it("groups thousands and rounds", () => {
    expect(formatNumber(2150)).toBe("2,150")
    expect(formatNumber(1234567.6)).toBe("1,234,568")
    expect(formatNumber(999)).toBe("999")
    expect(formatNumber(-1075.4)).toBe("-1,075")
    expect(formatNumber(-0.3)).toBe("0")
    expect(formatNumber(12.345, 1)).toBe("12.3")
  })

  it("formats millimetres", () => {
    expect(formatMm(2200)).toBe("2,200mm")
    expect(formatMm(17.6)).toBe("18mm")
  })

  it("formats degrees to at most one decimal place", () => {
    expect(formatDegrees(90)).toBe("90°")
    expect(formatDegrees(90.00000001)).toBe("90°")
    expect(formatDegrees(91.26)).toBe("91.3°")
    expect(formatDegrees(-90)).toBe("-90°")
  })
})

describe("convexHull", () => {
  it("drops interior, duplicate and collinear points", () => {
    const hull = convexHull([
      [0, 0],
      [500, 0], // collinear on an edge
      [1000, 0],
      [1000, 1000],
      [0, 1000],
      [400, 300], // interior
      [0, 0], // duplicate
    ])
    expect(hull).toHaveLength(4)
    expect(new Set(hull.map((p) => p.join(",")))).toEqual(
      new Set(["0,0", "1000,0", "1000,1000", "0,1000"])
    )
  })

  it("returns a clockwise-on-plan (positive area) outline", () => {
    const hull = convexHull([
      [0, 1000],
      [1000, 1000],
      [1000, 0],
      [0, 0],
      [500, 1500],
    ])
    expect(signedArea(hull)).toBeGreaterThan(0)
    expect(signedArea(hull)).toBe(1000 * 1000 + 250_000)
  })

  it("passes through fewer than three distinct points", () => {
    expect(
      convexHull([
        [1, 2],
        [1, 2],
      ])
    ).toEqual([[1, 2]])
  })
})

describe("clipToBounds", () => {
  it("cuts a polygon down to a rectangle", () => {
    const diamond: Point[] = [
      [0, -100],
      [100, 0],
      [0, 100],
      [-100, 0],
    ]
    const clipped = clipToBounds(diamond, {
      minX: -50,
      maxX: 50,
      minZ: -1000,
      maxZ: 1000,
    })
    const box = bounds(clipped)
    expect(box).toEqual({ minX: -50, maxX: 50, minZ: -100, maxZ: 100 })
    expect(signedArea(clipped)).toBeCloseTo(signedArea(diamond) - 2 * 2500, 9)
  })

  it("returns an empty list when nothing overlaps", () => {
    expect(
      clipToBounds(
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        { minX: 100, maxX: 200, minZ: 100, maxZ: 200 }
      )
    ).toEqual([])
  })
})

describe("circumscribedPolygon", () => {
  it("encloses the circle with flat sides exactly at ±radius", () => {
    const poly = circumscribedPolygon([100, 200], 300)
    expect(poly).toHaveLength(16)
    const box = bounds(poly)
    expect(box.minX).toBeCloseTo(-200, 9)
    expect(box.maxX).toBeCloseTo(400, 9)
    expect(box.minZ).toBeCloseTo(-100, 9)
    expect(box.maxZ).toBeCloseTo(500, 9)
    expect(signedArea(poly)).toBeGreaterThan(Math.PI * 300 * 300)
  })
})

describe("distances", () => {
  it("measures point-to-segment distance including the ends", () => {
    expect(pointSegmentDistance([50, 30], [0, 0], [100, 0])).toBe(30)
    expect(pointSegmentDistance([130, 40], [0, 0], [100, 0])).toBe(50)
    expect(pointSegmentDistance([3, 4], [0, 0], [0, 0])).toBe(5)
  })

  it("measures segment-to-segment distance (0 when crossing)", () => {
    expect(segmentDistance([0, 0], [100, 0], [50, 20], [50, 80])).toBe(20)
    expect(segmentDistance([0, 0], [100, 0], [50, -20], [50, 80])).toBe(0)
  })

  it("measures polygon-to-segment distance (0 when inside or touching)", () => {
    const square: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    expect(polygonSegmentDistance(square, [0, 118], [100, 118])).toBe(18)
    expect(polygonSegmentDistance(square, [50, 50], [60, 60])).toBe(0)
    expect(polygonSegmentDistance(square, [-10, 50], [10, 50])).toBe(0)
  })
})

describe("rayPolygonHit", () => {
  it("finds the first wall in front of the ray", () => {
    const hit = rayPolygonHit(LIVING_ROOM_CORNERS, [1550, 300], [0, 1])
    expect(hit?.point[0]).toBeCloseTo(1550, 9)
    expect(hit?.point[1]).toBeCloseTo(7690, 9)
    expect(hit?.distance).toBeCloseTo(7390, 9)
  })

  it("stops at the nearer step of a notched room", () => {
    const hit = rayPolygonHit(LIVING_ROOM_CORNERS, [2500, 300], [0, 1])
    expect(hit?.point[1]).toBeCloseTo(7090, 9)
  })

  it("ignores the edge the ray starts on", () => {
    const hit = rayPolygonHit(LIVING_ROOM_CORNERS, [1550, 0], [0, 1])
    expect(hit?.point[1]).toBeCloseTo(7690, 9)
  })

  it("returns undefined when the ray leaves without hitting", () => {
    expect(
      rayPolygonHit(LIVING_ROOM_CORNERS, [5000, 5000], [1, 0])
    ).toBeUndefined()
  })
})

describe("polygonCentroid", () => {
  it("is the middle of a rectangle", () => {
    closePoint(
      polygonCentroid([
        [0, 0],
        [3000, 0],
        [3000, 4000],
        [0, 4000],
      ]),
      [1500, 2000]
    )
  })

  it("weights by area for an L-shape", () => {
    // 2980 × 7090 block plus a 2170 × 600 recess below it.
    const a1 = 2980 * 7090
    const a2 = 2170 * 600
    const expected = [
      (1490 * a1 + 1085 * a2) / (a1 + a2),
      (3545 * a1 + 7390 * a2) / (a1 + a2),
    ]
    const [cx, cz] = polygonCentroid(LIVING_ROOM_CORNERS)
    expect(cx).toBeCloseTo(expected[0]!, 6)
    expect(cz).toBeCloseTo(expected[1]!, 6)
  })

  it("falls back to the vertex mean for a degenerate outline", () => {
    closePoint(
      polygonCentroid([
        [0, 0],
        [100, 0],
        [200, 0],
      ]),
      [100, 0]
    )
  })
})

describe("eulerXYZMatrix / rotateEulerXYZ", () => {
  it("is the identity for no rotation", () => {
    const m = eulerXYZMatrix([0, 0, 0])
    closePoint(m[0], [1, 0, 0])
    closePoint(m[1], [0, 1, 0])
    closePoint(m[2], [0, 0, 1])
  })

  it("rotates about each axis by the right-hand rule (three.js)", () => {
    closePoint(rotateEulerXYZ([0, 1, 0], [90, 0, 0]), [0, 0, 1])
    closePoint(rotateEulerXYZ([1, 0, 0], [0, 90, 0]), [0, 0, -1])
    closePoint(rotateEulerXYZ([1, 0, 0], [0, 0, 90]), [0, 1, 0])
  })

  it("composes as Rx · Ry · Rz (three.js Euler order XYZ)", () => {
    // Ry(90) takes +x to −z, then Rx(90) takes −z to +y.
    closePoint(rotateEulerXYZ([1, 0, 0], [90, 90, 0]), [0, 1, 0])
    // Rz(90) takes +x to +y, then Ry(90) leaves y alone, then Rx(90) → +z.
    closePoint(rotateEulerXYZ([1, 0, 0], [90, 90, 90]), [0, 0, 1])
  })
})
