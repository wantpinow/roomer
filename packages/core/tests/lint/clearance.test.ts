import { describe, expect, it } from "vitest"

import type { LayoutOp } from "../../src/schema"
import {
  boxAsset,
  codes,
  issuesOf,
  lintOps,
  lintRealistic,
  onlyIssue,
} from "./helpers"

// W102: an item's clearance zone (legroom, room to open doors or pull a
// chair out) must be free and, for the front, reachable from a door.

describe("W102 clearance zone blocked", () => {
  it("names what's in the zone, how far in, and how to clear it", () => {
    // Coffee table 320mm from the sofa: 30mm into its 350mm legroom.
    const { report } = lintRealistic([
      { op: "nudge", id: "coffee-table", dx: -100 },
    ])
    expect(onlyIssue(report, "W102")).toMatchObject({
      severity: "warning",
      placementIds: ["sofa", "coffee-table"],
      featureIds: [],
      message:
        "Sofa needs 350mm free at its front (legroom), but Coffee table is 30mm into it.",
      hint: "Move Coffee table 30mm towards W2 (nudge coffee-table dx: 30).",
    })
  })

  it("is satisfied by exactly the clearance", () => {
    const { report } = lintRealistic([
      { op: "nudge", id: "coffee-table", dx: -70 },
    ])
    expect(issuesOf(report, "W102")).toEqual([])
  })

  it("leaves overlapping items to E001", () => {
    const { report } = lintRealistic([
      { op: "nudge", id: "coffee-table", dx: -500 },
    ])
    expect(codes(report)).toContain("E001")
    expect(codes(report)).not.toContain("W102")
  })

  it("names the wall when the zone runs into it, and backs the item off", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "sb",
        asset: "a-sideboard",
        position: { mode: "at", x: 500, z: 4000, facing: 270 },
      },
    ])
    expect(onlyIssue(report, "W102")).toMatchObject({
      message:
        "Test sideboard needs 500mm free at its front (room to open its doors and drawers), but W6 is 225mm into it.",
      hint: "Move Test sideboard 225mm towards W2 (nudge sb dx: 225).",
    })
  })

  it("checks the space to pull a chair out, against obstacles too", () => {
    // Chair facing right with its back 230mm from the pier's face.
    const { report } = lintOps([
      {
        op: "add",
        id: "chair",
        asset: "a-chair",
        position: { mode: "at", x: 610, z: 2270, facing: 90 },
      },
    ])
    expect(onlyIssue(report, "W102")).toMatchObject({
      featureIds: ["OB1"],
      message:
        "Test dining chair needs 350mm free at its back (room to pull it out), but pier OB1 (Wall pier) is 120mm into it.",
      hint: "Move Test dining chair 120mm towards W2 (nudge chair dx: 120).",
    })
  })
})

describe("W102 clearance zone unreachable", () => {
  const bar = boxAsset("Bar", [1800, 100, 1000])
  const post = boxAsset("Post", [2200, 100, 1000])
  // A sofa on W6 (z 3,090–5,290) boxed in by touching bars on three sides,
  // leaving its legroom free but out of reach.
  const boxedIn: LayoutOp[] = [
    {
      op: "add",
      id: "sofa",
      asset: "a-sofa",
      label: "Sofa",
      position: { mode: "against", wall: "W6", at: 3500 },
    },
    {
      op: "add",
      id: "top",
      asset: "a-bar",
      position: { mode: "at", x: 918, z: 3040 },
    },
    {
      op: "add",
      id: "bottom",
      asset: "a-bar",
      position: { mode: "at", x: 918, z: 5340 },
    },
    {
      op: "add",
      id: "side",
      asset: "a-post",
      position: { mode: "at", x: 1768, z: 4190, facing: 90 },
    },
  ]

  it("flags a free front zone no route can reach", () => {
    const { report } = lintOps(boxedIn, {
      extraAssets: { "a-bar": bar, "a-post": post },
    })
    expect(onlyIssue(report, "W102")).toMatchObject({
      placementIds: ["sofa"],
      message:
        "Sofa needs 350mm free at its front (legroom), but no route at least 500mm wide leads there from a door.",
      hint: "Open a way in at least 500mm wide to the front of Sofa by moving the items that hem it in.",
    })
  })

  it("is satisfied once there's a way in", () => {
    const { report } = lintOps(
      boxedIn.filter((op) => op.op !== "add" || op.id !== "bottom"),
      { extraAssets: { "a-bar": bar, "a-post": post } }
    )
    expect(issuesOf(report, "W102")).toEqual([])
  })

  it("is quiet for the realistic layout", () => {
    expect(issuesOf(lintRealistic().report, "W102")).toEqual([])
  })
})
