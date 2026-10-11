import { describe, expect, it } from "vitest"

import { planKeyAction } from "../keyboard"

const id = "sofa"

describe("planKeyAction", () => {
  it("nudges 10mm with the arrows, up the page being −z", () => {
    expect(planKeyAction({ key: "ArrowRight" }, id)).toEqual({
      kind: "op",
      op: { op: "nudge", id, dx: 10 },
    })
    expect(planKeyAction({ key: "ArrowUp" }, id)).toEqual({
      kind: "op",
      op: { op: "nudge", id, dz: -10 },
    })
    expect(planKeyAction({ key: "ArrowLeft" }, id)).toEqual({
      kind: "op",
      op: { op: "nudge", id, dx: -10 },
    })
    expect(planKeyAction({ key: "ArrowDown" }, id)).toEqual({
      kind: "op",
      op: { op: "nudge", id, dz: 10 },
    })
  })

  it("nudges 100mm with Shift", () => {
    expect(planKeyAction({ key: "ArrowDown", shiftKey: true }, id)).toEqual({
      kind: "op",
      op: { op: "nudge", id, dz: 100 },
    })
  })

  it("turns 15° clockwise with R and back with Shift+R", () => {
    expect(planKeyAction({ key: "r" }, id)).toEqual({
      kind: "op",
      op: { op: "nudge", id, rotate: 15 },
    })
    expect(planKeyAction({ key: "R", shiftKey: true }, id)).toEqual({
      kind: "op",
      op: { op: "nudge", id, rotate: -15 },
    })
  })

  it("removes with Delete or Backspace", () => {
    expect(planKeyAction({ key: "Delete" }, id)).toEqual({ kind: "remove" })
    expect(planKeyAction({ key: "Backspace" }, id)).toEqual({ kind: "remove" })
  })

  it("deselects with Escape", () => {
    expect(planKeyAction({ key: "Escape" }, id)).toEqual({ kind: "deselect" })
  })

  it("leaves modifier shortcuts and other keys alone", () => {
    expect(planKeyAction({ key: "ArrowLeft", metaKey: true }, id)).toBeNull()
    expect(planKeyAction({ key: "r", ctrlKey: true }, id)).toBeNull()
    expect(planKeyAction({ key: "ArrowUp", altKey: true }, id)).toBeNull()
    expect(planKeyAction({ key: "x" }, id)).toBeNull()
  })
})
