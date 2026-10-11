import { describe, expect, it } from "vitest"

import {
  horizontalFovFor,
  verticalFovFor,
  WALK_HFOV,
  WALK_VFOV_MAX,
  WALK_VFOV_MIN,
} from "../lens"

describe("verticalFovFor", () => {
  it("keeps the horizontal view at WALK_HFOV on a wide (2:1) screen", () => {
    const vfov = verticalFovFor(WALK_HFOV, 2)
    expect(vfov).toBeGreaterThan(WALK_VFOV_MIN)
    expect(vfov).toBeLessThan(WALK_VFOV_MAX)
    expect(horizontalFovFor(vfov, 2)).toBeCloseTo(WALK_HFOV, 6)
  })

  it("never looks more than 70° up and down, so the eye line feels right", () => {
    expect(WALK_VFOV_MAX).toBe(70)
    // 16:9 would need ≈72.5° vertical for the full 105° across.
    expect(verticalFovFor(WALK_HFOV, 16 / 9)).toBe(70)
    // The workspace stage (~1024 × 663) would need ≈80°.
    expect(verticalFovFor(WALK_HFOV, 1024 / 663)).toBe(70)
  })

  it("narrows the horizontal view instead on squarer stages", () => {
    const aspect = 1024 / 663
    const hfov = horizontalFovFor(verticalFovFor(WALK_HFOV, aspect), aspect)
    expect(hfov).toBeLessThan(WALK_HFOV)
    expect(hfov).toBeGreaterThan(90)
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
