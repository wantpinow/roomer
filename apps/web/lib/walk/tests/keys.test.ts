import { describe, expect, it } from "vitest"

import { inputFromKeys, isWalkKey, TURN_SPEED, turnFromKeys } from "../keys"

describe("inputFromKeys", () => {
  it("is idle with nothing held", () => {
    expect(inputFromKeys(new Set(), 90)).toEqual({
      forward: 0,
      strafe: 0,
      run: false,
      jump: false,
      heading: 90,
    })
  })

  it("maps WASD and the arrows to forward/strafe", () => {
    expect(inputFromKeys(new Set(["KeyW", "KeyD"]), 0)).toMatchObject({
      forward: 1,
      strafe: 1,
    })
    expect(inputFromKeys(new Set(["ArrowDown", "ArrowLeft"]), 0)).toMatchObject(
      {
        forward: -1,
        strafe: -1,
      }
    )
  })

  it("cancels opposite keys", () => {
    expect(inputFromKeys(new Set(["KeyW", "KeyS"]), 0).forward).toBe(0)
  })

  it("runs with either Shift and jumps with Space", () => {
    expect(inputFromKeys(new Set(["ShiftRight", "Space"]), 0)).toMatchObject({
      run: true,
      jump: true,
    })
  })
})

describe("turnFromKeys", () => {
  it("turns right with E and left with Q", () => {
    expect(turnFromKeys(new Set(["KeyE"]), 0.5)).toBe(TURN_SPEED / 2)
    expect(turnFromKeys(new Set(["KeyQ"]), 0.5)).toBe(-TURN_SPEED / 2)
    expect(turnFromKeys(new Set(["KeyQ", "KeyE"]), 0.5)).toBe(0)
  })
})

describe("isWalkKey", () => {
  it("knows the walk keys only", () => {
    expect(isWalkKey("Space")).toBe(true)
    expect(isWalkKey("KeyE")).toBe(true)
    expect(isWalkKey("KeyZ")).toBe(false)
  })
})
