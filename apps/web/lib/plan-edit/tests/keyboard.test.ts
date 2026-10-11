import { describe, expect, it } from "vitest"

import { planKeyAction } from "../keyboard"

describe("planKeyAction", () => {
  it("nudges 10mm with the arrows, up the page being −z", () => {
    expect(planKeyAction({ key: "ArrowRight" }, 1)).toEqual({
      kind: "nudge",
      dx: 10,
      dz: 0,
    })
    expect(planKeyAction({ key: "ArrowUp" }, 1)).toEqual({
      kind: "nudge",
      dx: 0,
      dz: -10,
    })
    expect(planKeyAction({ key: "ArrowLeft" }, 3)).toEqual({
      kind: "nudge",
      dx: -10,
      dz: 0,
    })
  })

  it("nudges 100mm with Shift", () => {
    expect(planKeyAction({ key: "ArrowDown", shiftKey: true }, 2)).toEqual({
      kind: "nudge",
      dx: 0,
      dz: 100,
    })
  })

  it("turns one item 15° either way", () => {
    expect(planKeyAction({ key: "r" }, 1)).toEqual({
      kind: "rotate",
      degrees: 15,
    })
    expect(planKeyAction({ key: "R", shiftKey: true }, 1)).toEqual({
      kind: "rotate",
      degrees: -15,
    })
  })

  it("turns a group a quarter, or 15° with Shift", () => {
    expect(planKeyAction({ key: "r" }, 4)).toEqual({
      kind: "rotate",
      degrees: 90,
    })
    expect(planKeyAction({ key: "R", shiftKey: true }, 4)).toEqual({
      kind: "rotate",
      degrees: 15,
    })
  })

  it("raises and lowers with Alt+↑/↓, 100mm with Shift", () => {
    expect(planKeyAction({ key: "ArrowUp", altKey: true }, 1)).toEqual({
      kind: "lift",
      dy: 10,
    })
    expect(planKeyAction({ key: "ArrowDown", altKey: true }, 3)).toEqual({
      kind: "lift",
      dy: -10,
    })
    expect(
      planKeyAction({ key: "ArrowUp", altKey: true, shiftKey: true }, 1)
    ).toEqual({ kind: "lift", dy: 100 })
    expect(
      planKeyAction({ key: "ArrowDown", altKey: true, shiftKey: true }, 2)
    ).toEqual({ kind: "lift", dy: -100 })
    expect(planKeyAction({ key: "ArrowUp", altKey: true }, 0)).toBeNull()
    // Alt+←/→ stay with the browser.
    expect(planKeyAction({ key: "ArrowLeft", altKey: true }, 1)).toBeNull()
  })

  it("removes with Delete or Backspace", () => {
    expect(planKeyAction({ key: "Delete" }, 1)).toEqual({ kind: "remove" })
    expect(planKeyAction({ key: "Backspace" }, 2)).toEqual({ kind: "remove" })
  })

  it("clears with Escape, but only when something is selected", () => {
    expect(planKeyAction({ key: "Escape" }, 2)).toEqual({ kind: "deselect" })
    expect(planKeyAction({ key: "Escape" }, 0)).toBeNull()
  })

  it("selects everything with Cmd/Ctrl+A, selection or not", () => {
    expect(planKeyAction({ key: "a", metaKey: true }, 0)).toEqual({
      kind: "selectAll",
    })
    expect(planKeyAction({ key: "a", ctrlKey: true }, 2)).toEqual({
      kind: "selectAll",
    })
  })

  it("does nothing without a selection", () => {
    expect(planKeyAction({ key: "ArrowRight" }, 0)).toBeNull()
    expect(planKeyAction({ key: "r" }, 0)).toBeNull()
    expect(planKeyAction({ key: "Delete" }, 0)).toBeNull()
  })

  it("leaves other shortcuts and keys alone", () => {
    expect(planKeyAction({ key: "ArrowLeft", metaKey: true }, 1)).toBeNull()
    expect(planKeyAction({ key: "r", ctrlKey: true }, 1)).toBeNull()
    expect(
      planKeyAction({ key: "ArrowUp", altKey: true, metaKey: true }, 1)
    ).toBeNull()
    expect(
      planKeyAction({ key: "a", metaKey: true, altKey: true }, 1)
    ).toBeNull()
    expect(planKeyAction({ key: "x" }, 1)).toBeNull()
  })
})
