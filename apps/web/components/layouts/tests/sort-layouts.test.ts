import { describe, expect, it } from "vitest"

import { sortLayouts } from "../sort-layouts"

const layout = (
  id: string,
  status: "draft" | "candidate" | "favourite" | "archived",
  updatedAt: number
) => ({ id, status, updatedAt })

describe("sortLayouts", () => {
  it("ranks favourites, then candidates, then drafts", () => {
    const { active } = sortLayouts([
      layout("d", "draft", 30),
      layout("c", "candidate", 10),
      layout("f", "favourite", 1),
    ])
    expect(active.map((l) => l.id)).toEqual(["f", "c", "d"])
  })

  it("puts the most recently changed first within a status", () => {
    const { active } = sortLayouts([
      layout("old", "draft", 1),
      layout("new", "draft", 9),
      layout("mid", "draft", 5),
    ])
    expect(active.map((l) => l.id)).toEqual(["new", "mid", "old"])
  })

  it("splits archived layouts off, newest first", () => {
    const { active, archived } = sortLayouts([
      layout("a1", "archived", 1),
      layout("d", "draft", 2),
      layout("a2", "archived", 3),
    ])
    expect(active.map((l) => l.id)).toEqual(["d"])
    expect(archived.map((l) => l.id)).toEqual(["a2", "a1"])
  })

  it("does not mutate its input", () => {
    const input = [layout("d", "draft", 1), layout("f", "favourite", 2)]
    sortLayouts(input)
    expect(input.map((l) => l.id)).toEqual(["d", "f"])
  })
})
