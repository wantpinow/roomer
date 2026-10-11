import type { Point } from "@roomer/core/geometry"
import { describe, expect, it } from "vitest"

import {
  circleInsidePenetration,
  circleOverlapsPolygon,
  circlePolygonPenetration,
  closestPointOnSegment,
  outwardEdgeNormal,
} from "../collide"

// 1000 × 1000 square, clockwise on the plan (x right, z down).
const SQUARE: Point[] = [
  [0, 0],
  [1000, 0],
  [1000, 1000],
  [0, 1000],
]

// An L: the square minus its bottom-right quarter.
const L_SHAPE: Point[] = [
  [0, 0],
  [1000, 0],
  [1000, 500],
  [500, 500],
  [500, 1000],
  [0, 1000],
]

const close = (p: Point, q: Point) => {
  expect(p[0]).toBeCloseTo(q[0])
  expect(p[1]).toBeCloseTo(q[1])
}

describe("closestPointOnSegment", () => {
  it("clamps to the segment's ends", () => {
    expect(closestPointOnSegment([-5, 3], [0, 0], [10, 0])).toEqual([0, 0])
    expect(closestPointOnSegment([4, 3], [0, 0], [10, 0])).toEqual([4, 0])
  })

  it("handles a zero-length segment", () => {
    expect(closestPointOnSegment([4, 3], [1, 1], [1, 1])).toEqual([1, 1])
  })
})

describe("outwardEdgeNormal", () => {
  it("points out of the polygon for either winding", () => {
    close(outwardEdgeNormal(SQUARE, 0), [0, -1])
    // Reversed, edge 0 is the bottom edge (0,1000)→(1000,1000): out is +z.
    close(outwardEdgeNormal([...SQUARE].reverse(), 0), [0, 1])
  })
})

describe("circlePolygonPenetration", () => {
  it("is null when the circle is clear", () => {
    expect(circlePolygonPenetration([1300, 500], 250, SQUARE)).toBeNull()
  })

  it("pushes an overlapping circle straight out of the nearest face", () => {
    const pen = circlePolygonPenetration([1100, 500], 250, SQUARE)!
    close(pen.normal, [1, 0])
    expect(pen.depth).toBeCloseTo(150)
  })

  it("pushes radially off a corner", () => {
    const pen = circlePolygonPenetration([1100, 1100], 250, SQUARE)!
    close(pen.normal, [Math.SQRT1_2, Math.SQRT1_2])
    expect(pen.depth).toBeCloseTo(250 - 100 * Math.SQRT2)
  })

  it("pushes a centre that is inside out through the nearest face", () => {
    const pen = circlePolygonPenetration([900, 500], 250, SQUARE)!
    close(pen.normal, [1, 0])
    expect(pen.depth).toBeCloseTo(350)
  })

  it("uses the face normal when the centre is on the outline", () => {
    const pen = circlePolygonPenetration([500, 0], 250, SQUARE)!
    close(pen.normal, [0, -1])
    expect(pen.depth).toBeCloseTo(250)
  })

  it("follows a non-convex outline into its notch", () => {
    // In the L's missing quarter, nearest the arm above it.
    const pen = circlePolygonPenetration([700, 560], 250, L_SHAPE)!
    close(pen.normal, [0, 1])
    expect(pen.depth).toBeCloseTo(190)
    expect(circleOverlapsPolygon([800, 800], 250, L_SHAPE)).toBe(false)
  })
})

describe("circleInsidePenetration", () => {
  it("is null when the circle fits inside", () => {
    expect(circleInsidePenetration([500, 500], 250, SQUARE)).toBeNull()
  })

  it("pushes a circle back in from a wall", () => {
    const pen = circleInsidePenetration([100, 500], 250, SQUARE)!
    close(pen.normal, [1, 0])
    expect(pen.depth).toBeCloseTo(150)
  })

  it("pulls a centre that escaped back inside", () => {
    const pen = circleInsidePenetration([-50, 500], 250, SQUARE)!
    close(pen.normal, [1, 0])
    expect(pen.depth).toBeCloseTo(300)
  })

  it("pushes off the protruding corner of a notched room radially", () => {
    const pen = circleInsidePenetration([450, 450], 250, L_SHAPE)!
    close(pen.normal, [-Math.SQRT1_2, -Math.SQRT1_2])
    expect(pen.depth).toBeCloseTo(250 - 50 * Math.SQRT2)
  })
})
