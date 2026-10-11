import { describe, expect, it } from "vitest"

import { LIVING_ROOM_CORNERS, LIVING_ROOM_FEATURES } from "../../src/fixtures"
import { placementContext, resolvePosition } from "../../src/placement"
import { validateFeatures } from "../../src/room"
import { TEST_ASSETS } from "../../src/fixtures"
import type { RoomGeometry } from "../../src/geometry"
import type { BeamFeature } from "../../src/schema"

const room: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: 2450,
  skirting: { height: 150, depth: 18 },
  features: LIVING_ROOM_FEATURES,
}

const beam = (overrides: Partial<BeamFeature> = {}): BeamFeature => ({
  type: "beam",
  id: "BM9",
  start: [0, 3000],
  end: [2980, 3000],
  width: 250,
  drop: 230,
  ...overrides,
})

describe("beam validation", () => {
  it("accepts the living room's beam spanning wall to wall", () => {
    expect(validateFeatures(room)).toEqual([])
  })

  it("rejects a beam that ends outside the room", () => {
    const problems = validateFeatures({
      ...room,
      features: [beam({ end: [3500, 3000] })],
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("outside the room's outline")
  })

  it("rejects a zero-length beam", () => {
    const problems = validateFeatures({
      ...room,
      features: [beam({ end: [0, 3000] })],
    })
    expect(problems[0]).toContain("starts and ends at the same point")
  })

  it("rejects a beam that drops to the floor", () => {
    const problems = validateFeatures({
      ...room,
      features: [beam({ drop: 2450 })],
    })
    expect(problems[0]).toContain("would reach the floor")
  })
})

describe("centerOn a beam", () => {
  it("centres on the beam's midpoint and faces across it", () => {
    const ctx = placementContext(room, [])
    const pose = resolvePosition(
      { mode: "centerOn", feature: "BM1" },
      TEST_ASSETS.coffeeTable,
      ctx
    )
    expect(pose).toMatchObject({ x: 1490, z: 2650, facing: 180 })
  })
})
