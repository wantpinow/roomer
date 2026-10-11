import {
  type Camera,
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_SKIRTING,
  type RoomGeometry,
} from "@roomer/core"
import { describe, expect, it } from "vitest"

import { describeCameraForPrompt, describeRoomForPrompt } from "../describe"

const ROOM: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
}

const FROM_HALL: Camera = {
  id: "from-hall-door",
  name: "From the hall door",
  position: [1550, 1600, 350],
  target: [1150, 1050, 7000],
  fov: 55,
}

const FROM_WINDOW: Camera = {
  id: "from-window",
  name: "From the window",
  position: [950, 1550, 7350],
  target: [1750, 1000, 400],
  fov: 55,
}

describe("describeRoomForPrompt", () => {
  it("summarises size, shape, ceiling, doors, windows and fixtures", () => {
    expect(describeRoomForPrompt({ ...ROOM, name: "Living room" })).toBe(
      "Living room, about 2.98 m × 7.69 m (roughly rectangular, with a step in the outline), ceiling 2.45 m. Doors: hall door (D1), kitchen door (D2). Window: front window (WIN1), 1.93 m wide. Also: wall pier, radiator under window."
    )
  })

  it("calls a four-cornered room rectangular and copes with no features", () => {
    expect(
      describeRoomForPrompt({
        corners: [
          [0, 0],
          [4000, 0],
          [4000, 3000],
          [0, 3000],
        ],
        ceilingHeight: 2400,
        skirting: LIVING_ROOM_SKIRTING,
        features: [],
      })
    ).toBe("Room, about 4 m × 3 m (rectangular), ceiling 2.4 m.")
  })

  it("calls a deeply notched room irregular", () => {
    const summary = describeRoomForPrompt({
      ...ROOM,
      features: [],
      corners: [
        [0, 0],
        [4000, 0],
        [4000, 1000],
        [1000, 1000],
        [1000, 4000],
        [0, 4000],
      ],
    })
    expect(summary).toContain("(irregular)")
  })
})

describe("describeCameraForPrompt", () => {
  it("places the camera at the door, looking at the window, with light ahead", () => {
    expect(describeCameraForPrompt(FROM_HALL, ROOM)).toBe(
      "Eye-level view (1.6 m) from just inside the hall door (D1), looking towards the front window (WIN1), tilted slightly down, 55° vertical field of view. Daylight comes from the front window (WIN1), straight ahead."
    )
  })

  it("puts the window behind a camera looking back up the room", () => {
    expect(describeCameraForPrompt(FROM_WINDOW, ROOM)).toBe(
      "Eye-level view (1.55 m) from corner C6, looking towards the hall door (D1), tilted slightly down, 55° vertical field of view. Daylight comes from the front window (WIN1), behind the camera."
    )
  })

  it("says left or right for side windows and names a bare wall", () => {
    const camera: Camera = {
      ...FROM_HALL,
      position: [1500, 1600, 3500],
      target: [0, 1600, 3500], // looking at W6 (left wall on the plan)
    }
    const text = describeCameraForPrompt(camera, ROOM)
    expect(text).toContain("from inside the room, looking towards wall W6,")
    expect(text).not.toContain("tilted")
    // Facing −x, the window end (+z) is on the camera's left.
    expect(text).toContain("front window (WIN1), on the left")
  })

  it("handles a camera looking straight down and an upward tilt", () => {
    const down = describeCameraForPrompt(
      { ...FROM_HALL, target: [1550, 0, 350] },
      ROOM
    )
    expect(down).toMatch(
      /^Eye-level view \(1\.6 m\) from just inside the hall door \(D1\), tilted down, 55°/
    )
    const up = describeCameraForPrompt(
      { ...FROM_HALL, target: [1550, 2400, 3000] },
      ROOM
    )
    expect(up).toContain("tilted up")
  })
})
