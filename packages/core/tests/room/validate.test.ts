import { describe, expect, it } from "vitest"

import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_SKIRTING,
} from "../../src/fixtures"
import type { RoomGeometry } from "../../src/geometry"
import {
  featureName,
  featureProblems,
  partitionFeatures,
  validateFeatures,
} from "../../src/room"
import type { DoorFeature, Feature, WindowFeature } from "../../src/schema"

const LIVING_ROOM: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
}

function withFeatures(...features: Feature[]): RoomGeometry {
  return { ...LIVING_ROOM, features: [...LIVING_ROOM_FEATURES, ...features] }
}

const door = (overrides: Partial<DoorFeature> = {}): DoorFeature => ({
  type: "door",
  id: "D3",
  wall: "W2",
  offset: 1000,
  width: 800,
  bottom: 0,
  height: 1980,
  hinge: "start",
  swing: "in",
  ...overrides,
})

const window_ = (overrides: Partial<WindowFeature> = {}): WindowFeature => ({
  type: "window",
  id: "WIN2",
  wall: "W2",
  offset: 1000,
  width: 1000,
  bottom: 800,
  height: 1200,
  opens: "in",
  ...overrides,
})

describe("featureName", () => {
  it("reads the type as words followed by the id", () => {
    expect(featureName({ type: "door", id: "D1" })).toBe("door D1")
    expect(featureName({ type: "wall-light", id: "WL2" })).toBe(
      "wall light WL2"
    )
  })
})

describe("validateFeatures", () => {
  it("accepts the living room", () => {
    expect(validateFeatures(LIVING_ROOM)).toEqual([])
  })

  it("names the valid walls when a feature's wall doesn't exist", () => {
    expect(validateFeatures(withFeatures(door({ wall: "W9" })))).toEqual([
      "Door D3 is on W9, but this room's walls are W1, W2, W3, W4, W5, W6.",
    ])
  })

  it("gives the feature's extent and the wall length when it runs off the end", () => {
    // W5 (the window wall) is 2,170mm long.
    expect(
      validateFeatures(
        withFeatures(window_({ wall: "W5", offset: 300, width: 1930 }))
      )
    ).toEqual([
      "Window WIN2 runs from 300mm to 2,230mm along W5 (offset 300mm + width 1,930mm), but W5 is only 2,170mm long. Reduce the offset or width by 60mm.",
      // It also overlaps WIN1, which is on the same wall.
      "Window WIN1 (120mm–2,050mm) and window WIN2 (300mm–2,230mm) overlap by 1,750mm along W5. Openings in the same wall can't overlap — move one along the wall or narrow it.",
    ])
  })

  it("allows a feature that ends exactly at the wall's end", () => {
    expect(
      validateFeatures(
        withFeatures(door({ wall: "W4", offset: 0, width: 600 }))
      )
    ).toEqual([])
  })

  it("flags a wall feature whose top is above the ceiling", () => {
    expect(
      validateFeatures(withFeatures(window_({ bottom: 1000, height: 1500 })))
    ).toEqual([
      "Window WIN2's top is at 2,500mm (bottom 1,000mm + height 1,500mm), above the 2,450mm ceiling. Lower it by 50mm.",
    ])
  })

  it("flags openings that overlap on the same wall", () => {
    // D1 is on W1 from 1,150mm to 1,950mm.
    expect(
      validateFeatures(withFeatures(door({ wall: "W1", offset: 1500 })))
    ).toEqual([
      "Door D1 (1,150mm–1,950mm) and door D3 (1,500mm–2,300mm) overlap by 450mm along W1. Openings in the same wall can't overlap — move one along the wall or narrow it.",
    ])
  })

  it("allows openings that only touch, or that are stacked vertically", () => {
    const touching = door({ wall: "W1", offset: 1950 })
    const fanlight = window_({
      wall: "W1",
      offset: 1150,
      width: 800,
      bottom: 2000,
      height: 300,
    })
    expect(validateFeatures(withFeatures(touching, fanlight))).toEqual([])
  })

  it("ignores non-openings overlapping openings (a radiator under a window)", () => {
    // RAD1 already sits under WIN1 on W5; add a socket inside D2's span.
    const socket: Feature = {
      type: "socket",
      id: "S9",
      wall: "W2",
      offset: 5300,
      width: 86,
      bottom: 1000,
      height: 86,
    }
    expect(validateFeatures(withFeatures(socket))).toEqual([])
  })

  it("flags a floor feature that sticks out of the room", () => {
    const hearth: Feature = {
      type: "hearth",
      id: "H1",
      x: 100,
      z: 3000,
      width: 400,
      depth: 300,
      height: 20,
    }
    expect(validateFeatures(withFeatures(hearth))).toEqual([
      "Hearth H1 (centre 100, 3,000; 400mm × 300mm) sticks out of the room: its corner at (-100, 2,850) is outside the walls. Move it or make it smaller.",
    ])
  })

  it("accepts a floor feature flush against a wall", () => {
    const hearth: Feature = {
      type: "hearth",
      id: "H1",
      x: 200,
      z: 3000,
      width: 400,
      depth: 300,
      height: 20,
    }
    expect(validateFeatures(withFeatures(hearth))).toEqual([])
  })

  it("turns a floor feature's footprint by its facing", () => {
    // 1,000 wide × 400 deep at x = 300: only fits once turned to face +x.
    const base = {
      type: "floor-obstacle" as const,
      id: "FOB1",
      x: 300,
      z: 3000,
      width: 1000,
      depth: 400,
      height: 900,
    }
    expect(validateFeatures(withFeatures(base))).toHaveLength(1)
    expect(validateFeatures(withFeatures({ ...base, facing: 90 }))).toEqual([])
  })

  it("flags floor features in the notch outside the outline", () => {
    // The window recess notch: x 2,170–2,980, z 7,090–7,690 is outside.
    const socket: Feature = {
      type: "floor-socket",
      id: "FS1",
      x: 2500,
      z: 7400,
      width: 100,
      depth: 100,
      height: 20,
    }
    expect(validateFeatures(withFeatures(socket))).toEqual([
      "Floor socket FS1 (centre 2,500, 7,400; 100mm × 100mm) sticks out of the room: its corner at (2,450, 7,350) is outside the walls. Move it or make it smaller.",
    ])
  })

  it("flags a floor feature taller than the ceiling", () => {
    const pillar: Feature = {
      type: "floor-obstacle",
      id: "FOB1",
      x: 1000,
      z: 1000,
      width: 300,
      depth: 300,
      height: 2600,
    }
    expect(validateFeatures(withFeatures(pillar))).toEqual([
      "Floor obstacle FOB1 is 2,600mm tall, taller than the 2,450mm ceiling.",
    ])
  })

  it("flags ceiling features outside the outline", () => {
    const pendant: Feature = { type: "pendant", id: "L3", x: 2500, z: 7400 }
    expect(validateFeatures(withFeatures(pendant))).toEqual([
      "Pendant L3 at (2,500, 7,400) is outside the room's outline. Ceiling features need x/z inside the room.",
    ])
  })

  it("flags duplicate ids", () => {
    expect(
      validateFeatures(withFeatures(window_({ id: "D1", wall: "W6" })))
    ).toEqual([
      "2 features share the id D1 (door, window). Feature ids must be unique — rename all but one.",
    ])
  })
})

describe("featureProblems", () => {
  it("attributes each problem to the features involved", () => {
    const problems = featureProblems(
      withFeatures(
        door({ wall: "W1", offset: 1500 }),
        door({ id: "D4", wall: "W8" })
      )
    )
    expect(problems.map((p) => p.featureIds)).toEqual([["D4"], ["D1", "D3"]])
  })
})

describe("partitionFeatures", () => {
  it("separates features that fit from those that don't, with reasons", () => {
    const offWall = door({ wall: "W9" })
    const { valid, invalid } = partitionFeatures(withFeatures(offWall))
    expect(valid).toEqual(LIVING_ROOM_FEATURES)
    expect(invalid).toEqual([
      {
        feature: offWall,
        problems: [
          "Door D3 is on W9, but this room's walls are W1, W2, W3, W4, W5, W6.",
        ],
      },
    ])
  })
})
