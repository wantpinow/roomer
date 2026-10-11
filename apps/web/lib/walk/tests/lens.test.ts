import { describe, expect, it } from "vitest"

import {
  horizontalFovFor,
  verticalFovFor,
  WALK_HFOV,
  WALK_VFOV_MAX,
  WALK_VFOV_MIN,
} from "../lens"

describe("verticalFovFor", () => {
  it("keeps the horizontal view at WALK_HFOV on a 16:9 screen", () => {
    const vfov = verticalFovFor(WALK_HFOV, 16 / 9)
    expect(vfov).toBeGreaterThan(WALK_VFOV_MIN)
    expect(vfov).toBeLessThan(WALK_VFOV_MAX)
    expect(horizontalFovFor(vfov, 16 / 9)).toBeCloseTo(WALK_HFOV, 6)
  })

  it("is much wider than the old fixed 70° on a near-square stage", () => {
    const vfov = verticalFovFor(WALK_HFOV, 1.05)
    expect(horizontalFovFor(vfov, 1.05)).toBeGreaterThan(90)
    expect(horizontalFovFor(70, 1.05)).toBeLessThan(75)
  })

  it("clamps very tall and very wide viewports", () => {
    expect(verticalFovFor(WALK_HFOV, 0.5)).toBe(WALK_VFOV_MAX)
    expect(verticalFovFor(WALK_HFOV, 5)).toBe(WALK_VFOV_MIN)
  })

  it("falls back to the minimum for a degenerate viewport", () => {
    expect(verticalFovFor(WALK_HFOV, 0)).toBe(WALK_VFOV_MIN)
    expect(verticalFovFor(WALK_HFOV, Number.NaN)).toBe(WALK_VFOV_MIN)
  })
})
