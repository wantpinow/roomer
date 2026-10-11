import { describe, expect, it } from "vitest"

import {
  clampZoom,
  FIT_VIEWPORT,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  viewportTransform,
  zoomAt,
} from "../viewport"

describe("clampZoom", () => {
  it("keeps zoom within range", () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM)
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(2)).toBe(2)
  })
})

describe("zoomAt", () => {
  it("zooms about the centre by default", () => {
    expect(zoomAt(FIT_VIEWPORT, 2)).toEqual({ zoom: 2, pan: [0, 0] })
  })

  it("keeps the focus point still on screen", () => {
    const start = { zoom: 1, pan: [10, -20] as const }
    const focus = [100, 50] as const
    const next = zoomAt(start, 2, focus)
    // The drawing point under the focus before…
    const p = [
      (focus[0] - start.pan[0]) / start.zoom,
      (focus[1] - start.pan[1]) / start.zoom,
    ]
    // …is still under it after.
    expect(next.pan[0] + next.zoom * p[0]!).toBeCloseTo(focus[0])
    expect(next.pan[1] + next.zoom * p[1]!).toBeCloseTo(focus[1])
  })

  it("does not move when the zoom is already at its limit", () => {
    const atMax = { zoom: MAX_ZOOM, pan: [5, 5] as const }
    expect(zoomAt(atMax, 2, [300, 300])).toEqual({
      zoom: MAX_ZOOM,
      pan: [5, 5],
    })
  })
})

describe("panBy", () => {
  it("adds screen pixels to the pan", () => {
    expect(panBy({ zoom: 2, pan: [1, 2] }, 10, -5)).toEqual({
      zoom: 2,
      pan: [11, -3],
    })
  })
})

describe("viewportTransform", () => {
  it("translates then scales", () => {
    expect(viewportTransform({ zoom: 1.5, pan: [4, -8] })).toBe(
      "translate(4px, -8px) scale(1.5)"
    )
  })
})
