import { describe, expect, it } from "vitest"

import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_SKIRTING,
  TEST_ASSETS,
} from "@roomer/core/fixtures"
import type { Point, RoomGeometry } from "@roomer/core/geometry"
import type { Placement } from "@roomer/core/schema"

import {
  addToSelection,
  EMPTY_SELECTION,
  groupBounds,
  groupNudgeOps,
  groupRotateOps,
  idsInRect,
  polygonIntersectsRect,
  rectCentre,
  rectFrom,
  removeOps,
  restoreOps,
  rotateGroup,
  selectAll,
  selectedIds,
  selectionOf,
  snapDelta,
  toggleSelected,
  withOffsets,
} from "../group"
import { previewOps } from "../optimistic"

const room: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
}

const place = (
  id: string,
  assetId: string,
  x: number,
  z: number,
  facing: number,
  elevation = 0
): Placement => ({ id, assetId, x, z, facing, elevation })

const table = place("table", "t", 1500, 2000, 90)
const chair1 = place("chair-1", "c", 1000, 2000, 90)
const chair2 = place("chair-2", "c", 2000, 2000, 270)
const tv = place("tv", "tv", 2960, 4000, 270, 680)
const assets = {
  t: TEST_ASSETS.diningTable,
  c: TEST_ASSETS.diningChair,
  tv: TEST_ASSETS.wallTv,
}

describe("selection", () => {
  const placements = [table, chair1, chair2]

  it("lists the selected ids that exist, in layout order", () => {
    expect(
      selectedIds(selectionOf(["chair-2", "gone", "table"]), placements)
    ).toEqual(["table", "chair-2"])
    expect(selectedIds(EMPTY_SELECTION, placements)).toEqual([])
  })

  it("toggles an item in and out", () => {
    const one = toggleSelected(EMPTY_SELECTION, "table")
    expect(one).toEqual({ table: true })
    const two = toggleSelected(one, "chair-1")
    expect(two).toEqual({ table: true, "chair-1": true })
    expect(toggleSelected(two, "table")).toEqual({ "chair-1": true })
    // Never mutates.
    expect(two).toEqual({ table: true, "chair-1": true })
  })

  it("adds to a selection and selects everything", () => {
    expect(addToSelection({ table: true }, ["chair-1"])).toEqual({
      table: true,
      "chair-1": true,
    })
    expect(selectAll(placements)).toEqual({
      table: true,
      "chair-1": true,
      "chair-2": true,
    })
  })
})

describe("polygonIntersectsRect", () => {
  const square: Point[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]
  const diamond: Point[] = [
    [50, 0],
    [100, 50],
    [50, 100],
    [0, 50],
  ]

  it("finds overlap, containment and touching", () => {
    expect(polygonIntersectsRect(square, rectFrom([50, 50], [200, 200]))).toBe(
      true
    )
    expect(polygonIntersectsRect(square, rectFrom([10, 10], [20, 20]))).toBe(
      true
    )
    expect(
      polygonIntersectsRect(square, rectFrom([-50, -50], [500, 500]))
    ).toBe(true)
    expect(polygonIntersectsRect(square, rectFrom([100, 0], [150, 50]))).toBe(
      true
    )
  })

  it("rejects separated shapes, including across a diagonal edge", () => {
    expect(polygonIntersectsRect(square, rectFrom([101, 0], [150, 50]))).toBe(
      false
    )
    // Inside the diamond's bounding box but outside its slanted edge.
    expect(polygonIntersectsRect(diamond, rectFrom([0, 0], [20, 20]))).toBe(
      false
    )
    expect(polygonIntersectsRect(diamond, rectFrom([0, 0], [30, 30]))).toBe(
      true
    )
    expect(polygonIntersectsRect([], rectFrom([0, 0], [1, 1]))).toBe(false)
  })
})

describe("idsInRect", () => {
  it("picks the items whose outline meets the rectangle", () => {
    const footprints = [
      { id: "a", outline: rectPoints(0, 0, 100, 100) },
      { id: "b", outline: rectPoints(500, 500, 600, 600) },
    ]
    expect(idsInRect(footprints, rectFrom([90, 90], [200, 200]))).toEqual(["a"])
    expect(idsInRect(footprints, rectFrom([0, 0], [700, 700]))).toEqual([
      "a",
      "b",
    ])
  })
})

function rectPoints(x0: number, z0: number, x1: number, z1: number): Point[] {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ]
}

describe("snapDelta", () => {
  it("snaps the offset, not the items, to 10mm", () => {
    expect(snapDelta(123, -47)).toEqual([120, -50])
  })

  it("keeps whole mm when free", () => {
    expect(snapDelta(123.4, -47.6, { free: true })).toEqual([123, -48])
  })
})

describe("withOffsets and groupNudgeOps", () => {
  it("shifts only the moving items", () => {
    const next = withOffsets(
      [table, chair1, chair2],
      ["table", "chair-1"],
      30,
      -20
    )
    expect(next.map((p) => [p.id, p.x, p.z])).toEqual([
      ["table", 1530, 1980],
      ["chair-1", 1030, 1980],
      ["chair-2", 2000, 2000],
    ])
  })

  it("builds one nudge per item, and nothing for no movement", () => {
    expect(groupNudgeOps(["table", "chair-1"], 30, 0)).toEqual([
      { op: "nudge", id: "table", dx: 30 },
      { op: "nudge", id: "chair-1", dx: 30 },
    ])
    expect(groupNudgeOps(["table"], 0, 0)).toEqual([])
  })

  it("moves every item by the same delta through core", () => {
    const moved = previewOps({
      room,
      placements: [table, chair1, chair2],
      assets,
      ops: groupNudgeOps(["table", "chair-1", "chair-2"], 120, -300),
    })
    expect(moved?.map((p) => [p.x - 120, p.z + 300])).toEqual([
      [1500, 2000],
      [1000, 2000],
      [2000, 2000],
    ])
  })
})

describe("groupBounds", () => {
  it("spans every outline", () => {
    expect(
      groupBounds([rectPoints(0, 0, 10, 10), rectPoints(50, -5, 60, 5)])
    ).toEqual({ minX: 0, minZ: -5, maxX: 60, maxZ: 10 })
    expect(groupBounds([])).toBeNull()
  })

  it("finds the centre", () => {
    expect(rectCentre({ minX: 0, minZ: -5, maxX: 60, maxZ: 10 })).toEqual([
      30, 2.5,
    ])
  })
})

describe("rotateGroup", () => {
  const centre: Point = [1500, 2000]

  it("swings centres clockwise on the plan and turns facings", () => {
    expect(rotateGroup([table, chair1, chair2], centre, 90)).toEqual([
      { id: "table", x: 1500, z: 2000, facing: 180 },
      // The chair to the left of the table swings to above it…
      { id: "chair-1", x: 1500, z: 1500, facing: 180 },
      // …and the one to the right to below it.
      { id: "chair-2", x: 1500, z: 2500, facing: 0 },
    ])
  })

  it("turns back exactly, and composes 15° steps", () => {
    const quarter = rotateGroup([chair1], centre, 90)
    const back = rotateGroup(
      quarter.map((p) => ({ ...p })),
      centre,
      -90
    )
    expect(back[0]).toMatchObject({ x: 1000, z: 2000, facing: 90 })
    const fifteen = rotateGroup([chair1], centre, 15)[0]!
    expect(fifteen.facing).toBe(105)
    // 500mm from the centre, now 15° clockwise from due left (west).
    expect(fifteen.x).toBe(Math.round(1500 - 500 * Math.cos(Math.PI / 12)))
    expect(fifteen.z).toBe(Math.round(2000 - 500 * Math.sin(Math.PI / 12)))
  })

  it("lands on the same poses through core's nudge ops, keeping elevation", () => {
    const group = [table, chair1, tv]
    const bounds = groupBounds(
      group.map((p) => rectPoints(p.x - 1, p.z - 1, p.x + 1, p.z + 1))
    )!
    const pivot = rectCentre(bounds)
    const expected = rotateGroup(group, pivot, 90)
    const after = previewOps({
      room,
      placements: [table, chair1, chair2, tv],
      assets,
      ops: groupRotateOps(group, pivot, 90),
    })!
    for (const want of expected) {
      expect(after.find((p) => p.id === want.id)).toMatchObject(want)
    }
    // The wall TV keeps its height; chair-2 (not selected) didn't move.
    expect(after.find((p) => p.id === "tv")?.elevation).toBe(680)
    expect(after.find((p) => p.id === "chair-2")).toEqual(chair2)
  })
})

describe("removeOps and restoreOps", () => {
  it("removes a group and puts it back in one batch each", () => {
    const group = [chair1, tv]
    const removed = previewOps({
      room,
      placements: [table, chair1, tv],
      assets,
      ops: removeOps(group.map((p) => p.id)),
    })!
    expect(removed.map((p) => p.id)).toEqual(["table"])
    const restored = previewOps({
      room,
      placements: removed,
      assets,
      ops: restoreOps(group),
    })!
    expect(restored.find((p) => p.id === "tv")).toMatchObject({
      x: 2960,
      z: 4000,
      facing: 270,
      elevation: 680,
    })
    expect(restored.find((p) => p.id === "chair-1")).toMatchObject({
      x: 1000,
      z: 2000,
      facing: 90,
    })
  })
})
