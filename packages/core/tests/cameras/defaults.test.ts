import { describe, expect, it } from "vitest"

import { defaultCameras } from "../../src/cameras"
import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
} from "../../src/fixtures"
import { containsPoint, polygonCentroid } from "../../src/geometry"
import {
  DEFAULT_CAMERA_FOV,
  DEFAULT_EYE_HEIGHT,
  zCamera,
  type Feature,
} from "../../src/schema"

const LIVING_ROOM = {
  corners: LIVING_ROOM_CORNERS,
  features: LIVING_ROOM_FEATURES,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
}

const RECTANGLE = {
  corners: [
    [0, 0],
    [3000, 0],
    [3000, 4000],
    [0, 4000],
  ] satisfies [number, number][],
  ceilingHeight: 2400,
}

describe("defaultCameras", () => {
  const cameras = defaultCameras(LIVING_ROOM)

  it("makes one camera per doorway and per convex corner", () => {
    // Two doors; C4 is the notch's inside corner, so it gets none.
    expect(cameras.map((c) => c.id)).toEqual([
      "from-d1",
      "from-d2",
      "corner-c1",
      "corner-c2",
      "corner-c3",
      "corner-c5",
      "corner-c6",
    ])
    expect(cameras.map((c) => c.name)).toEqual([
      "From the kitchen door",
      "From the hall door",
      "From corner C1",
      "From corner C2",
      "From corner C3",
      "From corner C5",
      "From corner C6",
    ])
  })

  it("stands just inside a door, looking down the room", () => {
    // D1 is centred 1,550mm along W1 (the top wall); the room runs down.
    expect(cameras[0]).toMatchObject({
      position: [1550, DEFAULT_EYE_HEIGHT, 300],
      target: [1550, 1200, 7690],
    })
    // D2 is centred 5,630mm down W2 (the right wall); it looks left at W6.
    expect(cameras[1]).toMatchObject({
      position: [2980 - 300, DEFAULT_EYE_HEIGHT, 5630],
      target: [0, 1200, 5630],
    })
  })

  it("stands in a corner on the bisector, looking at the centre", () => {
    const [cx, cz] = polygonCentroid(LIVING_ROOM_CORNERS)
    expect(cameras[2]).toMatchObject({
      position: [283, DEFAULT_EYE_HEIGHT, 283],
      target: [Math.round(cx), 1200, Math.round(cz)],
    })
  })

  it("keeps every camera inside the room at eye height, as valid cameras", () => {
    for (const camera of cameras) {
      expect(zCamera.parse(camera)).toEqual(camera)
      expect(camera.fov).toBe(DEFAULT_CAMERA_FOV)
      expect(camera.position[1]).toBe(DEFAULT_EYE_HEIGHT)
      expect(
        containsPoint(LIVING_ROOM_CORNERS, [
          camera.position[0],
          camera.position[2],
        ])
      ).toBe(true)
      for (const value of [...camera.position, ...camera.target]) {
        expect(Number.isInteger(value)).toBe(true)
      }
    }
  })

  it("stays below a low ceiling", () => {
    const low = defaultCameras({
      ...RECTANGLE,
      ceilingHeight: 1500,
      features: [],
    })
    expect(low).toHaveLength(4)
    for (const camera of low) {
      expect(camera.position[1]).toBe(1400)
      expect(camera.target[1]).toBe(1200)
    }
  })

  it("names unlabelled doors and openings by id, skipping unknown walls", () => {
    const features: Feature[] = [
      {
        type: "door",
        id: "D3",
        wall: "W1",
        offset: 100,
        width: 800,
        bottom: 0,
        height: 1980,
        hinge: "start",
        swing: "in",
      },
      {
        type: "opening",
        id: "OP1",
        wall: "W3",
        offset: 500,
        width: 1200,
        bottom: 0,
        height: 2000,
      },
      {
        type: "opening",
        id: "OP2",
        label: "TV nook arch",
        wall: "W2",
        offset: 500,
        width: 1200,
        bottom: 0,
        height: 2000,
      },
      {
        type: "door",
        id: "D9",
        wall: "W9",
        offset: 0,
        width: 800,
        bottom: 0,
        height: 1980,
        hinge: "start",
        swing: "in",
      },
    ]
    const doors = defaultCameras({ ...RECTANGLE, features }).slice(0, 3)
    expect(doors.map((c) => [c.id, c.name])).toEqual([
      ["from-d3", "From door D3"],
      ["from-op1", "From opening OP1"],
      ["from-op2", "From the TV nook arch"],
    ])
  })
})
