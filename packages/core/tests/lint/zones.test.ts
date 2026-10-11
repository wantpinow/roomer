import { describe, expect, it } from "vitest"

import type { LayoutOp } from "../../src/schema"
import { boxAsset, codes, issuesOf, lintOps, onlyIssue } from "./helpers"

// W103 (tall item in front of a radiator), W104 (item above the sill in
// front of a window) and W105 (a raised floor item with nothing under it).
// RAD1 runs x 385–1,785 on W5 (z 7,690), 110mm deep; WIN1 x 120–2,050 with
// a 650mm sill.

const sideboardBy = (z: number): LayoutOp => ({
  op: "add",
  id: "sb",
  asset: "a-sideboard",
  position: { mode: "at", x: 1000, z, facing: 0 },
})

describe("W103 item in front of a radiator", () => {
  it("flags a tall item within 300mm of the radiator's front", () => {
    // Sideboard back at z 7,425: 155mm in front of the radiator's face.
    const { report } = lintOps([sideboardBy(7200)])
    expect(onlyIssue(report, "W103")).toMatchObject({
      placementIds: ["sb"],
      featureIds: ["RAD1"],
      message:
        "Test sideboard stands 155mm in front of radiator RAD1 (Radiator under window): anything over 300mm tall within 300mm of a radiator blocks its heat.",
      hint: "Move Test sideboard 145mm away from W5 (nudge sb dz: -145).",
    })
  })

  it("leaves low items and items further away alone", () => {
    const low = lintOps(
      [
        {
          op: "add",
          id: "bench",
          asset: "a-bench",
          position: { mode: "at", x: 1000, z: 7400 },
        },
      ],
      { extraAssets: { "a-bench": boxAsset("Bench", [1200, 300, 280]) } }
    )
    expect(codes(low.report)).not.toContain("W103")
    const far = lintOps([sideboardBy(7000)])
    expect(codes(far.report)).not.toContain("W103")
  })
})

describe("W104 item in front of a window", () => {
  it("flags an item rising above the sill within 300mm of the window", () => {
    const { report } = lintOps([sideboardBy(7200)])
    expect(onlyIssue(report, "W104")).toMatchObject({
      placementIds: ["sb"],
      featureIds: ["WIN1"],
      message:
        "Test sideboard (top at 750mm) stands 265mm from window WIN1 (Front window), above its 650mm sill — it blocks the light and the way to the window.",
      hint: "Move Test sideboard 35mm away from W5 (nudge sb dz: -35).",
    })
  })

  it("leaves items lower than the sill alone", () => {
    // A 600mm-tall cabinet under the window, clear of the radiator.
    const { report } = lintOps(
      [
        {
          op: "add",
          id: "low",
          asset: "a-low",
          position: { mode: "against", wall: "W5", at: 220 },
        },
      ],
      { extraAssets: { "a-low": boxAsset("Low cabinet", [300, 400, 600]) } }
    )
    expect(codes(report)).not.toContain("W104")
    expect(codes(report)).not.toContain("W103")
    expect(report.ok).toBe(true)
  })
})

describe("W105 item floating", () => {
  const table: LayoutOp = {
    op: "add",
    id: "table",
    asset: "a-dining-table",
    position: { mode: "at", x: 1500, z: 3000 },
  }
  // Table top: x 600–2,400, z 2,550–3,450, 750mm up.

  it("accepts an item standing on another item's top", () => {
    const { report } = lintOps([
      table,
      {
        op: "add",
        id: "box",
        asset: "a-coffee-table",
        position: { mode: "at", x: 1500, z: 3000, elevation: 750 },
      },
    ])
    expect(codes(report)).not.toContain("W105")
  })

  it("flags a raised item with nothing under it", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "ct",
        asset: "a-coffee-table",
        position: { mode: "at", x: 1500, z: 5000, elevation: 400 },
      },
    ])
    expect(onlyIssue(report, "W105")).toMatchObject({
      placementIds: ["ct"],
      message:
        "Test coffee table is 400mm off the floor and nothing is under it, so it would float.",
      hint: "Set ct's elevation to 0 to put it on the floor, or centre it on a table or sideboard and set the elevation to that item's height.",
    })
  })

  it("flags an item only partly on a surface and offers to stand it there", () => {
    // Only the back legs reach the table, and only 30 of their 40mm.
    const { report } = lintOps([
      table,
      {
        op: "add",
        id: "ct",
        asset: "a-coffee-table",
        position: { mode: "at", x: 1500, z: 3720, elevation: 750 },
      },
    ])
    const issue = onlyIssue(report, "W105")
    expect(issue.message).toBe(
      "Test coffee table is 750mm off the floor and only 38% of its base rests on Test dining table, so it would float."
    )
  })

  it("ignores items on the floor", () => {
    expect(issuesOf(lintOps([table]).report, "W105")).toEqual([])
  })
})
