import { describe, expect, it } from "vitest"

import { LIVING_ROOM_FEATURES } from "../../src/fixtures"
import type { Feature, LayoutOp } from "../../src/schema"
import { codes, issuesOf, lintOps, onlyIssue } from "./helpers"

// E004 (inside an inward door's swing) and E005 (in a doorway zone).
// D1 (W1, kitchen) swings out into the kitchen; D2 (W2, hall) swings in
// with its hinge at the window end: a 760mm quarter circle centred on
// (2,980, 6,010) sweeping from the wall up towards D1 to straight across.

const chair = (x: number, z: number, facing = 270, id = "chair"): LayoutOp => ({
  op: "add",
  id,
  asset: "a-chair",
  position: { mode: "at", x, z, facing },
})

describe("E004 item inside a door's swing", () => {
  it("says how far the door can still open and how to clear it", () => {
    // 520 (x) × 450 (z) chair just inside D2, near its handle side.
    const { report } = lintOps([chair(2100, 5500)])
    const issue = onlyIssue(report, "E004")
    expect(issue).toMatchObject({
      placementIds: ["chair"],
      featureIds: ["D2"],
      message:
        "Test dining chair is in the swing of door D2 (Hall door): the door can only open about 54° before hitting it.",
    })
    expect(issue.hint).toMatch(/^Move Test dining chair \d+mm /)
  })

  it("says the door can't open at all when the item is against it", () => {
    const { report } = lintOps([chair(2715, 5650)])
    expect(onlyIssue(report, "E004").message).toBe(
      "Test dining chair is in the swing of door D2 (Hall door): the door can't open at all."
    )
    // It's in the doorway too, but that's the same problem: no E005, and
    // no walking-route warning through the blocked door either.
    expect(codes(report)).not.toContain("E005")
    expect(codes(report)).not.toContain("W101")
  })

  it("checks both leaves of a double door", () => {
    const features: Feature[] = LIVING_ROOM_FEATURES.map((f) =>
      f.id === "D2" && f.type === "door" ? { ...f, leaves: 2 } : f
    )
    // Each leaf is 380mm: the old hinge-end arc no longer reaches 2,100.
    const clear = lintOps([chair(2100, 5500)], { features })
    expect(codes(clear.report)).not.toContain("E004")
    const near = lintOps([chair(2450, 5350)], { features })
    expect(onlyIssue(near.report, "E004").featureIds).toEqual(["D2"])
  })

  it("ignores doors that swing out and rugs under a door", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "rug",
        asset: "a-rug",
        position: { mode: "at", x: 1980, z: 5630, facing: 90 },
      },
    ])
    expect(codes(report)).not.toContain("E004")
    // In front of D1 (swings out) it's a doorway problem, not a swing one.
    const d1 = lintOps([chair(1550, 450, 0)])
    expect(codes(d1.report)).toContain("E005")
    expect(codes(d1.report)).not.toContain("E004")
  })
})

describe("E005 item blocks a doorway", () => {
  it("flags an item in the 600mm zone in front of a door", () => {
    const { report } = lintOps([chair(1550, 450, 0)])
    expect(onlyIssue(report, "E005")).toMatchObject({
      placementIds: ["chair"],
      featureIds: ["D1"],
      message:
        "Test dining chair blocks the doorway of door D1 (Kitchen door): it comes within 190mm of it, and 600mm in front of a doorway must stay clear.",
      hint: "Move Test dining chair 410mm away from W1 (nudge chair dz: 410).",
    })
  })

  it("treats a doorless opening the same way", () => {
    const opening: Feature = {
      type: "opening",
      id: "OP1",
      wall: "W6",
      offset: 6000,
      width: 900,
      bottom: 0,
      height: 2000,
    }
    const { report } = lintOps([chair(400, 1250, 90)], {
      features: [...LIVING_ROOM_FEATURES, opening],
    })
    expect(onlyIssue(report, "E005").message).toMatch(
      /^Test dining chair blocks the opening of opening OP1: it comes within \d+mm of it/
    )
  })

  it("leaves items outside the zone alone", () => {
    const { report } = lintOps([chair(1550, 900, 0)])
    expect(issuesOf(report, "E005")).toEqual([])
  })
})
