import { describe, expect, it } from "vitest"

import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_SKIRTING,
  TEST_ASSETS,
} from "@roomer/core/fixtures"
import type { RoomGeometry } from "@roomer/core/geometry"
import type { Placement } from "@roomer/core/schema"

import { moveOp, previewOps, restoreOp, withPosition } from "../optimistic"

const room: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
}
const assets = {
  "a-table": TEST_ASSETS.coffeeTable,
  "a-sofa": TEST_ASSETS.sofa,
}
const table: Placement = {
  id: "coffee-table",
  assetId: "a-table",
  label: "Table",
  x: 1490,
  z: 3000,
  facing: 180,
  elevation: 0,
}
const sofa: Placement = {
  id: "sofa",
  assetId: "a-sofa",
  x: 500,
  z: 3000,
  facing: 90,
  elevation: 0,
}
const placements = [table, sofa]

describe("previewOps", () => {
  it("applies a nudge exactly as core does", () => {
    const next = previewOps({
      room,
      placements,
      assets,
      ops: [{ op: "nudge", id: "coffee-table", dx: 100, dz: -10, rotate: 15 }],
    })
    expect(next?.find((p) => p.id === "coffee-table")).toMatchObject({
      x: 1590,
      z: 2990,
      facing: 195,
      label: "Table",
    })
  })

  it("applies a move to an absolute position", () => {
    const next = previewOps({
      room,
      placements,
      assets,
      ops: [moveOp(table, 1200, 2500)],
    })
    expect(next?.[0]).toMatchObject({ x: 1200, z: 2500, facing: 180 })
  })

  it("removes and restores a placement", () => {
    const removed = previewOps({
      room,
      placements,
      assets,
      ops: [{ op: "remove", id: "sofa" }],
    })
    expect(removed?.map((p) => p.id)).toEqual(["coffee-table"])
    const restored = previewOps({
      room,
      placements: removed ?? [],
      assets,
      ops: [restoreOp(sofa)],
    })
    expect(restored?.find((p) => p.id === "sofa")).toMatchObject({
      x: 500,
      z: 3000,
      facing: 90,
      assetId: "a-sofa",
    })
  })

  it("returns null when core refuses the ops", () => {
    expect(
      previewOps({
        room,
        placements,
        assets,
        ops: [{ op: "nudge", id: "missing", dx: 10 }],
      })
    ).toBeNull()
  })

  it("does not mutate its input", () => {
    previewOps({ room, placements, assets, ops: [moveOp(table, 0, 0)] })
    expect(placements[0]).toBe(table)
    expect(table.x).toBe(1490)
  })
})

describe("withPosition", () => {
  it("replaces one item's centre", () => {
    const next = withPosition(placements, "sofa", 600, 3100)
    expect(next[1]).toMatchObject({ x: 600, z: 3100, facing: 90 })
    expect(next[0]).toBe(table)
  })
})

describe("restoreOp", () => {
  it("keeps label and mirroring", () => {
    expect(restoreOp({ ...table, mirrored: true })).toEqual({
      op: "add",
      id: "coffee-table",
      asset: "a-table",
      label: "Table",
      mirrored: true,
      position: { mode: "at", x: 1490, z: 3000, facing: 180, elevation: 0 },
    })
  })
})
