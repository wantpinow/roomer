import { containsPoint } from "@roomer/core/geometry"
import { describe, expect, it } from "vitest"

import {
  FIXTURE_ASSETS,
  FIXTURE_PLACEMENTS,
  FIXTURE_ROOM,
} from "@/lib/scene/fixture-scene"

import {
  floorSeatedEyeHeight,
  lieTarget,
  POSTURE,
  seatedEyeHeight,
  seatTarget,
} from "../posture"
import { buildWalkWorld } from "../world"

const world = buildWalkWorld({
  room: FIXTURE_ROOM,
  placements: FIXTURE_PLACEMENTS,
  assets: FIXTURE_ASSETS,
})

const sofaCushions = world.colliders.filter(
  (c) => c.id === "sofa" && c.y1 === 560
)

describe("eye heights", () => {
  it("follow stature: ≈805 mm above a seat for 6 ft, a little lower on the floor", () => {
    expect(seatedEyeHeight(1830)).toBe(805)
    expect(floorSeatedEyeHeight(1830)).toBe(765)
    expect(seatedEyeHeight(1626)).toBe(715)
  })
})

describe("seatTarget", () => {
  it("sits on the sofa's cushions facing the way the sofa faces (the TV)", () => {
    // Standing in front of the sofa (its front is x = 968).
    const target = seatTarget(world, [1240, 3950], 10, 270)
    expect(target).toMatchObject({
      posture: "sitting",
      heading: 90,
      pitch: 0,
      on: { id: "sofa", label: "Test three-seat sofa" },
      label: "Sitting on Test three-seat sofa",
    })
    expect(target.eye[1]).toBe(560 + 805)
    const seat: [number, number] = [target.eye[0], target.eye[2]]
    expect(sofaCushions.some((c) => containsPoint(c.footprint, seat))).toBe(
      true
    )
    // Sat in from the front edge, not on it.
    expect(target.eye[0]).toBeLessThanOrEqual(968 - POSTURE.seat.inset + 1)
  })

  it("chooses the sofa over the coffee table (tables are never seats)", () => {
    // Between the two: the coffee table (top 420) is nearer.
    const target = seatTarget(world, [1300, 3950], 10, 270)
    expect(target.on?.id).toBe("sofa")
  })

  it("sits on a chair seat facing the table", () => {
    const target = seatTarget(world, [635, 5420], 0, 180)
    expect(target.on?.id).toBe("chair-1")
    expect(target.heading).toBe(180)
    expect(target.eye[1]).toBe(480 + 805)
  })

  it("sits on the floor (or rug) with nothing in reach", () => {
    expect(seatTarget(world, [1500, 1500], 0, 45)).toEqual({
      posture: "sitting",
      eye: [1500, 765, 1500],
      heading: 45,
      pitch: 0,
      on: null,
      label: "Sitting on the floor",
    })
    // On the rug, 10 mm up.
    expect(seatTarget(world, [1900, 3000], 10, 0).eye[1]).toBe(10 + 765)
  })

  it("never sits on a dining table, whatever its height", () => {
    const tableOnly = buildWalkWorld({
      room: FIXTURE_ROOM,
      placements: FIXTURE_PLACEMENTS.filter((p) => p.id === "dining-table"),
      assets: FIXTURE_ASSETS,
    })
    expect(seatTarget(tableOnly, [1085, 5600], 0, 180).on).toBeNull()
  })

  it("uses the walker's stature for the eye height", () => {
    const short = buildWalkWorld({
      room: FIXTURE_ROOM,
      placements: FIXTURE_PLACEMENTS,
      assets: FIXTURE_ASSETS,
      statureMm: 1626,
    })
    expect(seatTarget(short, [1240, 3950], 10, 270).eye[1]).toBe(560 + 715)
  })
})

describe("lieTarget", () => {
  it("lies along the sofa, head at the end nearer the walker, looking up", () => {
    // Beside the sofa towards its z = 2850 end; it runs along z.
    const target = lieTarget(world, [1240, 3300], 10, 270)
    expect(target).toMatchObject({
      posture: "lying",
      pitch: POSTURE.lie.pitch,
      on: { id: "sofa" },
      label: "Lying on Test three-seat sofa",
    })
    // Head 250 mm in from the near end, feet towards the far end (+z).
    expect(target.eye[2]).toBeCloseTo(2850 + POSTURE.lie.headInset)
    expect(target.heading).toBeCloseTo(180)
    // On the cushions: 560 + 180.
    expect(target.eye[1]).toBe(740)
  })

  it("lies on the floor (or rug) with no sofa or bed in reach", () => {
    expect(lieTarget(world, [1500, 1500], 0, 30)).toEqual({
      posture: "lying",
      eye: [1500, 180, 1500],
      heading: 30,
      pitch: POSTURE.lie.pitch,
      on: null,
      label: "Lying on the floor",
    })
  })

  it("won't lie along something too short", () => {
    // Next to the dining chairs only: seats, but no 1.5 m to lie along.
    expect(lieTarget(world, [1535, 7350], 0, 0).on).toBeNull()
  })
})
