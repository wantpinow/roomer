import { describe, expect, it } from "vitest"

import { defaultCameras } from "../../src/cameras"
import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
} from "../../src/fixtures"
import { syncDefaultCameras } from "../../src/room"
import type { Camera } from "../../src/schema"

const ROOM = {
  corners: LIVING_ROOM_CORNERS,
  features: LIVING_ROOM_FEATURES,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
}

const SOFA_VIEW: Camera = {
  id: "sofa-view",
  name: "From the sofa",
  position: [500, 1100, 4000],
  target: [2980, 1100, 4000],
  fov: 55,
}

describe("syncDefaultCameras", () => {
  it("keeps the cameras as they are when nothing they depend on changed", () => {
    const cameras = [...defaultCameras(ROOM), SOFA_VIEW]
    expect(syncDefaultCameras(ROOM, ROOM, cameras)).toEqual(cameras)
  })

  it("regenerates untouched defaults for the new room and keeps custom ones", () => {
    const withoutD2 = {
      ...ROOM,
      features: LIVING_ROOM_FEATURES.filter((f) => f.id !== "D2"),
    }
    const synced = syncDefaultCameras(ROOM, withoutD2, [
      ...defaultCameras(ROOM),
      SOFA_VIEW,
    ])
    expect(synced).toEqual([...defaultCameras(withoutD2), SOFA_VIEW])
    expect(synced.map((c) => c.id)).not.toContain("from-d2")
  })

  it("keeps a default camera someone edited, and drops its regenerated twin", () => {
    const [first, ...rest] = defaultCameras(ROOM)
    const edited: Camera = { ...first!, fov: 70 }
    const taller = { ...ROOM, ceilingHeight: 3000 }
    const synced = syncDefaultCameras(ROOM, taller, [edited, ...rest])
    expect(synced.filter((c) => c.id === edited.id)).toEqual([edited])
    expect(synced).toHaveLength(defaultCameras(taller).length)
  })

  it("adds the defaults when the stored cameras lack them", () => {
    expect(syncDefaultCameras(ROOM, ROOM, [SOFA_VIEW])).toEqual([
      ...defaultCameras(ROOM),
      SOFA_VIEW,
    ])
  })
})
