import { describe, expect, it } from "vitest"

import { LIVING_ROOM_CORNERS } from "../../src/fixtures"
import {
  bearingDelta,
  bearingOf,
  cornerAngles,
  deriveWalls,
  directionOf,
  ensureClockwiseOnPlan,
  facingToRotationY,
  isClockwiseOnPlan,
  isSimplePolygon,
  normalizeBearing,
  placementTransform,
  rotateClockwise,
  rotationYToFacing,
  signedArea,
  toWallFrame,
  wallPoint,
  type Point,
} from "../../src/geometry"

const close = (a: Point, b: Point) => {
  expect(a[0]).toBeCloseTo(b[0], 6)
  expect(a[1]).toBeCloseTo(b[1], 6)
}

describe("bearings", () => {
  it("maps plan directions to compass-style bearings", () => {
    expect(bearingOf([0, -1])).toBe(0)
    expect(bearingOf([1, 0])).toBe(90)
    expect(bearingOf([0, 1])).toBe(180)
    expect(bearingOf([-1, 0])).toBe(270)
  })

  it("round-trips directionOf", () => {
    for (const b of [0, 33, 90, 180, 271.5]) {
      expect(bearingOf(directionOf(b))).toBeCloseTo(b, 9)
    }
  })

  it("normalises any angle into [0, 360)", () => {
    expect(normalizeBearing(-90)).toBe(270)
    expect(normalizeBearing(720)).toBe(0)
    expect(normalizeBearing(359.9999999999)).toBe(0)
  })

  it("measures the smallest difference between bearings", () => {
    expect(bearingDelta(350, 10)).toBe(20)
    expect(bearingDelta(90, 270)).toBe(180)
  })

  it("converts facing to a three.js rotation and back", () => {
    expect(facingToRotationY(180)).toBe(0)
    for (const f of [0, 45, 90, 180, 300]) {
      expect(rotationYToFacing(facingToRotationY(f))).toBeCloseTo(f, 9)
    }
  })

  it("rotates clockwise on the plan", () => {
    close(rotateClockwise([1, 0], 90), [0, 1])
    close(rotateClockwise([0, 1], 90), [-1, 0])
  })
})

describe("polygons", () => {
  it("treats the living room corners as clockwise on the plan", () => {
    expect(isClockwiseOnPlan(LIVING_ROOM_CORNERS)).toBe(true)
    expect(signedArea(LIVING_ROOM_CORNERS)).toBe(2980 * 7090 + 2170 * 600)
  })

  it("reverses anticlockwise polygons", () => {
    const anticlockwise = [...LIVING_ROOM_CORNERS].reverse()
    expect(isClockwiseOnPlan(ensureClockwiseOnPlan(anticlockwise))).toBe(true)
  })

  it("detects self-intersection", () => {
    expect(isSimplePolygon(LIVING_ROOM_CORNERS)).toBe(true)
    const bowtie: Point[] = [
      [0, 0],
      [1000, 1000],
      [1000, 0],
      [0, 1000],
    ]
    expect(isSimplePolygon(bowtie)).toBe(false)
  })
})

describe("walls", () => {
  const walls = deriveWalls(LIVING_ROOM_CORNERS)

  it("derives one wall per corner with ids and lengths", () => {
    expect(walls.map((w) => w.id)).toEqual(["W1", "W2", "W3", "W4", "W5", "W6"])
    expect(walls.map((w) => Math.round(w.length))).toEqual([
      2980, 7090, 810, 600, 2170, 7690,
    ])
    expect(walls[0]!.startCorner).toBe("C1")
    expect(walls[5]!.endCorner).toBe("C1")
  })

  it("points normals into the room", () => {
    // W1 is the top wall: inward is down the page. W6 is the left wall.
    close(walls[0]!.normal, [0, 1])
    expect(walls[0]!.inwardBearing).toBe(180)
    close(walls[5]!.normal, [1, 0])
    expect(walls[5]!.inwardBearing).toBe(90)
    // W3 (the step) runs right → left along z = 7090; inward is up.
    expect(walls[2]!.inwardBearing).toBe(0)
  })

  it("walks along and into a wall", () => {
    close(wallPoint(walls[5]!, 1000, 100), [100, 6690])
    const frame = toWallFrame(walls[5]!, [100, 6690])
    expect(frame.along).toBeCloseTo(1000, 9)
    expect(frame.inset).toBeCloseTo(100, 9)
  })

  it("computes interior corner angles including the reflex notch", () => {
    expect(cornerAngles(LIVING_ROOM_CORNERS).map(Math.round)).toEqual([
      90, 90, 90, 270, 90, 90,
    ])
  })
})

describe("placementTransform", () => {
  it("is the identity (plus translation) when facing down the page", () => {
    const t = placementTransform({
      x: 1000,
      z: 2000,
      facing: 180,
      elevation: 0,
    })
    close(t.toPlan(100, 50), [1100, 2050])
  })

  it("points the local front along the facing bearing", () => {
    for (const facing of [0, 90, 180, 270, 30]) {
      const t = placementTransform({ x: 0, z: 0, facing, elevation: 0 })
      const front = t.toPlan(0, 1)
      close(front, directionOf(facing))
    }
  })

  it("keeps local +x on the viewer's right", () => {
    // Facing right (+x): a viewer looking at its front faces −x, so their
    // right hand points up the page (−z).
    const t = placementTransform({ x: 0, z: 0, facing: 90, elevation: 0 })
    close(t.toPlan(1, 0), [0, -1])
  })

  it("mirrors left/right", () => {
    const t = placementTransform({
      x: 0,
      z: 0,
      facing: 180,
      elevation: 0,
      mirrored: true,
    })
    close(t.toPlan(100, 0), [-100, 0])
  })

  it("round-trips toLocal", () => {
    const t = placementTransform({
      x: 500,
      z: 700,
      facing: 123,
      elevation: 40,
      mirrored: true,
    })
    const [px, pz] = t.toPlan(321, -45)
    close(t.toLocal(px, pz), [321, -45])
    expect(t.toWorld(0, 10, 0)[1]).toBe(50)
  })
})
