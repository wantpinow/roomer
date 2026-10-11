import { describe, expect, it } from "vitest"

import { FIXTURE_ROOM } from "../fixture-scene"
import { sunSetup } from "../lighting"
import { buildRoomShell } from "../room-geometry"

describe("sunSetup", () => {
  it("shines in through the living room's window, angled across the room", () => {
    const sun = sunSetup(buildRoomShell(FIXTURE_ROOM))
    expect(sun.window).toBe("WIN1")
    const [dx, dy, dz] = sun.direction
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(1)
    // WIN1 is on the bottom wall: light travels up the plan (−z) and down.
    expect(dz).toBeLessThan(0)
    expect(dy).toBeLessThan(0)
    // Skewed clockwise on the plan, i.e. towards +x.
    expect(dx).toBeGreaterThan(0)
    // The light sits outside the window end, aimed at the room's centre.
    expect(sun.position[2]).toBeGreaterThan(7.88)
    expect(sun.target[1]).toBe(0)
  })

  it("climbs higher when the ceiling is off", () => {
    const shell = buildRoomShell(FIXTURE_ROOM)
    const inside = sunSetup(shell)
    const overhead = sunSetup(shell, { overhead: true })
    expect(overhead.direction[1]).toBeLessThan(inside.direction[1])
    expect(overhead.direction[1]).toBeCloseTo(-Math.sin((58 * Math.PI) / 180))
    expect(overhead.window).toBe("WIN1")
  })

  it("covers the whole room with the shadow camera", () => {
    const sun = sunSetup(buildRoomShell(FIXTURE_ROOM))
    expect(sun.shadowHalfSize).toBeGreaterThan(Math.hypot(3.18, 7.98) / 2)
    const distance = Math.hypot(
      sun.position[0] - sun.target[0],
      sun.position[1] - sun.target[1],
      sun.position[2] - sun.target[2]
    )
    expect(sun.shadowFar).toBeGreaterThan(distance + 4)
  })

  it("falls back to a high fixed sun in a windowless room", () => {
    const sun = sunSetup(buildRoomShell({ ...FIXTURE_ROOM, features: [] }))
    expect(sun.window).toBeUndefined()
    expect(sun.direction[1]).toBeCloseTo(-Math.sin((55 * Math.PI) / 180))
  })
})
