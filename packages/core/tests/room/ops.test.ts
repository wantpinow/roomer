import { describe, expect, it } from "vitest"

import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_FINISHES,
  LIVING_ROOM_NAME,
  LIVING_ROOM_SKIRTING,
} from "../../src/fixtures"
import { applyShellOps, ShellOpError, type ShellRoom } from "../../src/room"
import type { FeatureInput, ShellOp } from "../../src/schema"

const ROOM: ShellRoom = {
  name: LIVING_ROOM_NAME,
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
  finishes: LIVING_ROOM_FINISHES,
}

const NEW_DOOR = {
  type: "door",
  wall: "W2",
  offset: 1000,
  width: 800,
  bottom: 0,
  height: 1980,
  hinge: "start",
  swing: "in",
} satisfies FeatureInput

const ADD_DOOR = { op: "addFeature", feature: NEW_DOOR } satisfies ShellOp

function shellOpError(fn: () => unknown): ShellOpError {
  try {
    fn()
  } catch (error) {
    if (error instanceof ShellOpError) return error
    throw error
  }
  throw new Error("expected a ShellOpError")
}

describe("applyShellOps", () => {
  it("returns the room unchanged for an empty batch", () => {
    const result = applyShellOps(ROOM, [])
    expect(result.room).toEqual(ROOM)
    expect(result.changes).toEqual([])
  })

  it("adds a feature, assigning the next readable id", () => {
    const { room, changes } = applyShellOps(ROOM, [ADD_DOOR])
    expect(room.features.at(-1)).toMatchObject({ id: "D3", type: "door" })
    expect(changes).toEqual([
      {
        index: 0,
        op: "addFeature",
        featureId: "D3",
        summary: "Added door D3 on W2 at 1,000mm",
      },
    ])
  })

  it("keeps an id the agent chose, and describes floor/ceiling positions", () => {
    const { room, changes } = applyShellOps(ROOM, [
      {
        op: "addFeature",
        feature: { type: "pendant", id: "dining-pendant", x: 1490, z: 6000 },
      },
    ])
    expect(room.features.at(-1)?.id).toBe("dining-pendant")
    expect(changes[0]?.summary).toBe(
      "Added pendant dining-pendant at (1,490, 6,000)"
    )
  })

  it("assigns distinct ids to several features added in one batch", () => {
    const { room } = applyShellOps(ROOM, [
      ADD_DOOR,
      { ...ADD_DOOR, feature: { ...NEW_DOOR, offset: 2500 } },
    ])
    expect(room.features.slice(-2).map((f) => f.id)).toEqual(["D3", "D4"])
  })

  it("refuses to add a feature whose id is taken", () => {
    const error = shellOpError(() =>
      applyShellOps(ROOM, [
        {
          op: "addFeature",
          feature: { type: "pendant", id: "L1", x: 1000, z: 1000 },
        },
      ])
    )
    expect(error.opIndex).toBe(0)
    expect(error.message).toBe(
      "ops[0] (addFeature): A feature with id L1 already exists. Leave out id to have one assigned, or choose another."
    )
  })

  it("replaces a feature and summarises what changed", () => {
    const { room, changes } = applyShellOps(ROOM, [
      {
        op: "updateFeature",
        id: "WIN1",
        feature: {
          type: "window",
          wall: "W5",
          offset: 200,
          width: 1800,
          bottom: 650,
          height: 1450,
          opens: "out",
        },
      },
    ])
    const win1 = room.features.find((f) => f.id === "WIN1")
    // Full replacement: fields left out (revealDepth, label…) are gone.
    expect(win1).toEqual({
      type: "window",
      id: "WIN1",
      wall: "W5",
      offset: 200,
      width: 1800,
      bottom: 650,
      height: 1450,
      opens: "out",
    })
    expect(changes[0]?.summary).toBe(
      "Updated window WIN1: label Front window → none, offset 120 → 200, width 1,930 → 1,800, revealDepth 100 → none, sillDepth 50 → none"
    )
  })

  it("says when an update changes the feature's type", () => {
    const { changes } = applyShellOps(ROOM, [
      {
        op: "updateFeature",
        id: "D2",
        feature: {
          type: "opening",
          wall: "W2",
          offset: 5250,
          width: 760,
          bottom: 0,
          height: 1980,
        },
      },
    ])
    expect(changes[0]?.summary).toBe("Changed D2 from a door to an opening")
  })

  it("lists the existing ids when updating or removing an unknown feature", () => {
    for (const op of [
      { op: "removeFeature", id: "D9" },
      {
        op: "updateFeature",
        id: "D9",
        feature: { type: "pendant", x: 1, z: 1 },
      },
    ] satisfies ShellOp[]) {
      const error = shellOpError(() => applyShellOps(ROOM, [ADD_DOOR, op]))
      expect(error.opIndex).toBe(1)
      expect(error.message).toBe(
        `ops[1] (${op.op}): There's no feature D9 (existing features: D1, D2, WIN1, OB1, RAD1, L1, L2, S1, S2, S3, S4, D3).`
      )
    }
  })

  it("explains there are no features yet in an empty room", () => {
    const error = shellOpError(() =>
      applyShellOps({ ...ROOM, features: [] }, [
        { op: "removeFeature", id: "D1" },
      ])
    )
    expect(error.message).toContain("the room has no features yet")
  })

  it("removes a feature", () => {
    const { room, changes } = applyShellOps(ROOM, [
      { op: "removeFeature", id: "S4" },
    ])
    expect(room.features.map((f) => f.id)).not.toContain("S4")
    expect(changes[0]?.summary).toBe("Removed socket S4")
  })

  it("sets skirting, ceiling height and name", () => {
    const { room, changes } = applyShellOps(ROOM, [
      { op: "setSkirting", skirting: { height: 120, depth: 15 } },
      { op: "setCeilingHeight", ceilingHeight: 2600 },
      { op: "rename", name: "Lounge" },
    ])
    expect(room).toMatchObject({
      skirting: { height: 120, depth: 15 },
      ceilingHeight: 2600,
      name: "Lounge",
    })
    expect(changes.map((c) => c.summary)).toEqual([
      "Set the skirting to 120mm high × 15mm deep",
      "Set the ceiling height to 2,600mm",
      "Renamed the room from 'Living room' to 'Lounge'",
    ])
  })

  it("merges finishes; an empty string removes one", () => {
    const { room, changes } = applyShellOps(ROOM, [
      { op: "setFinishes", finishes: { walls: "sage green", notes: "" } },
    ])
    expect(room.finishes).toEqual({
      ...LIVING_ROOM_FINISHES,
      walls: "sage green",
      notes: undefined,
    })
    expect("notes" in room.finishes).toBe(false)
    expect(changes[0]?.summary).toBe(
      "Set the walls finish and cleared the notes finish"
    )
  })

  it("summarises a finishes op that only clears", () => {
    const { changes } = applyShellOps(ROOM, [
      { op: "setFinishes", finishes: { notes: "" } },
    ])
    expect(changes[0]?.summary).toBe("Cleared the notes finish")
  })

  it("refuses a finishes op with nothing in it", () => {
    const error = shellOpError(() =>
      applyShellOps(ROOM, [{ op: "setFinishes", finishes: {} }])
    )
    expect(error.message).toMatch(
      /^ops\[0\] \(setFinishes\): No finishes given/
    )
  })

  it("validates the final room and blames the op that caused the problem", () => {
    const error = shellOpError(() =>
      applyShellOps(ROOM, [
        { op: "rename", name: "Lounge" },
        {
          ...ADD_DOOR,
          feature: { ...NEW_DOOR, wall: "W4", width: 900 },
        },
        { op: "removeFeature", id: "S1" },
      ])
    )
    expect(error.opIndex).toBe(1)
    expect(error.op).toBe("addFeature")
    expect(error.issues).toEqual([
      "Door D3 runs from 1,000mm to 1,900mm along W4 (offset 1,000mm + width 900mm), but W4 is only 600mm long. Reduce the offset or width by 1,300mm.",
    ])
    expect(error.message).toBe(`ops[1] (addFeature): ${error.issues[0]}`)
  })

  it("lets a batch pass through an invalid intermediate state", () => {
    // Raising the ceiling after adding a tall window is fine: only the end
    // state is checked.
    const { room } = applyShellOps(ROOM, [
      {
        op: "addFeature",
        feature: {
          type: "window",
          wall: "W2",
          offset: 1000,
          width: 1000,
          bottom: 1000,
          height: 1600,
          opens: "in",
        },
      },
      { op: "setCeilingHeight", ceilingHeight: 2700 },
    ])
    expect(room.ceilingHeight).toBe(2700)
  })

  it("blames a ceiling change for features it pushes above the ceiling", () => {
    const error = shellOpError(() =>
      applyShellOps(ROOM, [
        { op: "removeFeature", id: "S1" },
        { op: "setCeilingHeight", ceilingHeight: 2000 },
      ])
    )
    expect(error.opIndex).toBe(1)
    // WIN1 (top 2,100mm) and OB1 (full height, 2,450mm) no longer fit.
    expect(error.issues).toHaveLength(2)
    expect(error.message).toMatch(
      /^ops\[1\] \(setCeilingHeight\): Window WIN1's top is at 2,100mm .* \(and 1 more problem\)$/
    )
  })

  it("does not fail an edit for problems the room already had", () => {
    const broken: ShellRoom = {
      ...ROOM,
      features: [
        ...ROOM.features,
        {
          type: "socket",
          id: "S9",
          wall: "W9",
          offset: 0,
          width: 86,
          bottom: 300,
          height: 86,
        },
      ],
    }
    const { room } = applyShellOps(broken, [{ op: "rename", name: "Lounge" }])
    expect(room.name).toBe("Lounge")
    // …and the broken feature can be fixed or removed.
    expect(() =>
      applyShellOps(broken, [{ op: "removeFeature", id: "S9" }])
    ).not.toThrow()
  })

  it("does not modify the room it was given", () => {
    const before = structuredClone(ROOM)
    applyShellOps(ROOM, [
      ADD_DOOR,
      { op: "removeFeature", id: "S1" },
      { op: "setFinishes", finishes: { walls: "blue" } },
    ])
    expect(ROOM).toEqual(before)
  })
})
