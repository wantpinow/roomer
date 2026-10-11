import { describe, expect, it } from "vitest"

import {
  FISHEYE,
  fisheyeRay,
  fisheyeSourceUv,
  planeTangent,
  planFisheye,
  rectilinearCoverage,
  stereographicAngle,
  stereographicFocal,
  stereographicRadius,
} from "../fisheye"

const DEG = Math.PI / 180
const W = 1536
const H = 1024

const angleOf = ([x, y, z]: [number, number, number]) =>
  Math.acos(z / Math.hypot(x, y, z)) / DEG

describe("stereographic projection", () => {
  it("puts the top and bottom edges at half the vertical fov", () => {
    for (const fov of [70, 100, 120]) {
      const f = stereographicFocal(H, fov)
      expect(angleOf(fisheyeRay(0, H / 2, f))).toBeCloseTo(fov / 2, 6)
      expect(angleOf(fisheyeRay(0, -H / 2, f))).toBeCloseTo(fov / 2, 6)
    }
  })

  it("maps radius and angle back and forth", () => {
    const f = 500
    for (const r of [0, 10, 300, 999]) {
      expect(stereographicRadius(stereographicAngle(r, f), f)).toBeCloseTo(r, 6)
    }
  })

  it("gives unit rays: the centre straight ahead, offsets in their direction", () => {
    const f = stereographicFocal(H, 100)
    expect(fisheyeRay(0, 0, f)).toEqual([0, 0, 1])
    const [x, y, z] = fisheyeRay(300, -400, f)
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12)
    // Same direction on the image as the pixel offset (right, down).
    expect(x / y).toBeCloseTo(300 / -400, 12)
    expect(z).toBeGreaterThan(0)
  })

  it("is wider than a rectilinear view of the same vertical fov", () => {
    // At the right edge of a 3:2 frame, rectilinear fov 70 sees 46.4°
    // off-axis; stereographic fov 70 sees more.
    const f = stereographicFocal(H, 70)
    const rectilinear = Math.atan(1.5 * Math.tan(35 * DEG)) / DEG
    expect(angleOf(fisheyeRay(W / 2, 0, f))).toBeGreaterThan(rectilinear)
  })
})

describe("planeTangent", () => {
  it("projects onto the z = 1 plane", () => {
    expect(planeTangent([0.5, -0.25, 0.5])).toEqual([1, -0.5])
  })

  it("has no answer at or behind 90°", () => {
    expect(planeTangent([1, 0, 0])).toBeNull()
    expect(planeTangent([0.5, 0, -0.5])).toBeNull()
  })
})

describe("rectilinearCoverage", () => {
  it("is set by the image corner", () => {
    const f = stereographicFocal(H, 70)
    const { tanHalfH, tanHalfV } = rectilinearCoverage(W, H, f)
    const [tx, ty] = planeTangent(fisheyeRay(W / 2, H / 2, f))!
    expect(tanHalfH).toBeCloseTo(tx, 12)
    expect(tanHalfV).toBeCloseTo(ty, 12)
    // Every edge pixel is inside that extent.
    for (let i = 0; i <= 20; i++) {
      const [ex, ey] = planeTangent(fisheyeRay(W / 2, (i / 20 - 0.5) * H, f))!
      expect(Math.abs(ex)).toBeLessThanOrEqual(tanHalfH + 1e-9)
      expect(Math.abs(ey)).toBeLessThanOrEqual(tanHalfV + 1e-9)
    }
  })

  it("caps at maxTan when the corners reach 90° or more", () => {
    const f = stereographicFocal(H, 120)
    // The corner of a 3:2 frame at fov 120 is ≈ 92° off-axis.
    expect(angleOf(fisheyeRay(W / 2, H / 2, f))).toBeGreaterThan(90)
    expect(rectilinearCoverage(W, H, f)).toEqual({
      tanHalfH: FISHEYE.maxTan,
      tanHalfV: FISHEYE.maxTan,
    })
  })
})

describe("planFisheye", () => {
  it("plans a source that covers the whole frame at fov 100", () => {
    const plan = planFisheye(W, H, 100)
    expect(plan.focal).toBeCloseTo(stereographicFocal(H, 100))
    expect(Math.max(plan.sourceWidth, plan.sourceHeight)).toBeLessThanOrEqual(
      FISHEYE.maxSourceSize
    )
    expect(plan.tanHalfH / plan.tanHalfV).toBeCloseTo(
      plan.sourceWidth / plan.sourceHeight,
      12
    )
    expect(plan.sourceFov).toBeCloseTo((2 * Math.atan(plan.tanHalfV)) / DEG, 9)
    // Every border pixel lands inside the source.
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      for (const [px, py] of [
        [t * W, 0.5],
        [t * W, H - 0.5],
        [0.5, t * H],
        [W - 0.5, t * H],
      ] as const) {
        expect(fisheyeSourceUv(plan, px, py)).not.toBeNull()
      }
    }
  })

  it("matches the output's sharpness on the axis when the source fits", () => {
    const plan = planFisheye(W, H, 70)
    // px per unit tangent at the source centre ≈ supersample × focal.
    const density = plan.sourceHeight / (2 * plan.tanHalfV)
    expect(density / plan.focal).toBeCloseTo(FISHEYE.supersample, 2)
  })

  it("shrinks very wide sources to the size cap", () => {
    const plan = planFisheye(W, H, 120)
    expect(Math.max(plan.sourceWidth, plan.sourceHeight)).toBe(
      FISHEYE.maxSourceSize
    )
    // Corners past 90° have nothing to sample: background.
    expect(fisheyeSourceUv(plan, 0.5, 0.5)).toBeNull()
    expect(fisheyeSourceUv(plan, W / 2, H / 2)).toEqual([0.5, 0.5])
  })
})

describe("fisheyeSourceUv", () => {
  it("samples the source centre at the image centre and scales outward", () => {
    const plan = planFisheye(W, H, 100)
    expect(fisheyeSourceUv(plan, W / 2, H / 2)).toEqual([0.5, 0.5])
    const [, v] = fisheyeSourceUv(plan, W / 2, H)!
    // The top edge is fov/2 = 50° up: tan 50° on the source's tangent scale.
    expect(v).toBeCloseTo(0.5 + (0.5 * Math.tan(50 * DEG)) / plan.tanHalfV, 9)
  })
})
