import { zCamera } from "@roomer/core"
import { describe, expect, it } from "vitest"

import {
  photoSize,
  timeLabel,
  walkCamera,
  type WalkViewSnapshot,
} from "../photo"

const AT = new Date(2026, 9, 11, 9, 5, 30)

const view: WalkViewSnapshot = {
  position: [1550.4, 1711, 300.2],
  // Looking down the room (+z) and 10° down.
  direction: [
    0,
    -Math.sin((10 * Math.PI) / 180),
    Math.cos((10 * Math.PI) / 180),
  ],
  fov: 70,
  aspect: 1.545,
}

describe("walkCamera", () => {
  it("freezes the walker's view as a valid rectilinear camera", () => {
    const camera = walkCamera(view, AT)
    expect(zCamera.parse(camera)).toEqual(camera)
    expect(camera).toEqual({
      id: `walk-photo-${AT.getTime()}`,
      name: "Walk photo 09:05",
      position: [1550, 1711, 300],
      target: [1550, 1711 - 174, 300 + 985],
      fov: 70,
      projection: "rectilinear",
    })
  })

  it("names saved viewpoints differently", () => {
    const camera = walkCamera(view, AT, "view")
    expect(camera.id).toBe(`walk-${AT.getTime()}`)
    expect(camera.name).toBe("Walk view 09:05")
  })

  it("keeps the target 1 m away even for an unnormalised direction", () => {
    const camera = walkCamera({ ...view, direction: [3, 0, 4] }, AT)
    expect(camera.target).toEqual([1550 + 600, 1711, 300 + 800])
  })

  it("rounds the fov and keeps it within the schema's 10–120°", () => {
    expect(walkCamera({ ...view, fov: 64.27 }, AT).fov).toBe(64.3)
    expect(walkCamera({ ...view, fov: 150 }, AT).fov).toBe(120)
  })
})

describe("photoSize", () => {
  it("matches the viewport's shape", () => {
    expect(photoSize(1.545)).toEqual({ width: 1536, height: 1024 })
    expect(photoSize(0.6)).toEqual({ width: 1024, height: 1536 })
    expect(photoSize(1.1)).toEqual({ width: 1024, height: 1024 })
    expect(photoSize(0.9)).toEqual({ width: 1024, height: 1024 })
  })
})

describe("timeLabel", () => {
  it("is zero-padded local time", () => {
    expect(timeLabel(new Date(2026, 0, 1, 7, 3))).toBe("07:03")
    expect(timeLabel(new Date(2026, 0, 1, 23, 59))).toBe("23:59")
  })
})
