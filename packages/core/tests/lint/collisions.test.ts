import { describe, expect, it } from "vitest"

import { LIVING_ROOM_FEATURES } from "../../src/fixtures"
import type { LayoutOp } from "../../src/schema"
import {
  boxAsset,
  codes,
  issuesOf,
  lintOps,
  lintRealistic,
  onlyIssue,
} from "./helpers"

// E001 (items overlap) and E002 (an item overlaps a fixed obstacle).

const table: LayoutOp = {
  op: "add",
  id: "table",
  asset: "a-dining-table",
  position: { mode: "at", x: 1500, z: 3500 },
}
// Table top: z 3050..3950 (front edge z 3950), y 710..750.

/** A chair facing the table from the front side, its seat `tuck` under. */
const chairAt = (tuck: number, id = "chair"): LayoutOp => ({
  op: "add",
  id,
  asset: "a-chair",
  position: { mode: "at", x: 1500, z: 3950 - tuck + 260, facing: 0 },
})

describe("E001 items overlap", () => {
  it("reports a pair once, with the overlap size and a concrete move", () => {
    const { report } = lintRealistic([
      { op: "nudge", id: "coffee-table", dx: -500 },
    ])
    const issue = onlyIssue(report, "E001")
    expect(issue).toMatchObject({
      severity: "error",
      placementIds: ["sofa", "coffee-table"],
      featureIds: [],
      message: "Sofa overlaps Coffee table by 80mm × 1,100mm.",
      hint: "Move Coffee table 80mm towards W2 (nudge coffee-table dx: 80).",
      at: [928, 4220],
    })
    expect(report.ok).toBe(false)
  })

  it("allows overlaps up to the 5mm tolerance", () => {
    // Coffee table front at x 1,388; the sofa's front is at 968.
    const within = lintRealistic([
      { op: "nudge", id: "coffee-table", dx: -425 },
    ])
    expect(issuesOf(within.report, "E001")).toEqual([])
    const beyond = lintRealistic([
      { op: "nudge", id: "coffee-table", dx: -426 },
    ])
    expect(onlyIssue(beyond.report, "E001").message).toContain("6mm × ")
  })

  it("lets a chair tuck its seat under a table top", () => {
    const { report } = lintOps([table, chairAt(300)])
    expect(issuesOf(report, "E001")).toEqual([])
  })

  it("flags a chair pushed in so far its back hits the table top", () => {
    const { report } = lintOps([table, chairAt(500)])
    const issue = onlyIssue(report, "E001")
    expect(issue.placementIds).toEqual(["table", "chair"])
    expect(issue.message).toBe(
      "Test dining table overlaps Test dining chair by 450mm × 20mm."
    )
    expect(issue.hint).toBe(
      "Move Test dining chair 20mm towards W5 (nudge chair dz: 20)."
    )
  })

  it("never collides a rug with furniture, so a rug can go under a sofa", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "sofa",
        asset: "a-sofa",
        position: { mode: "against", wall: "W6", at: 3000 },
      },
      {
        op: "add",
        id: "rug",
        asset: "a-rug",
        position: { mode: "centerOn", placement: "sofa", dx: 600 },
      },
    ])
    expect(codes(report)).not.toContain("E001")
    expect(report.ok).toBe(true)
  })

  it("collides rugs with each other", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "rug-a",
        asset: "a-rug",
        position: { mode: "at", x: 1400, z: 3000 },
      },
      {
        op: "add",
        id: "rug-b",
        asset: "a-rug",
        position: { mode: "at", x: 1400, z: 4000 },
      },
    ])
    expect(onlyIssue(report, "E001").message).toBe(
      "Test rug (rug-a) overlaps Test rug (rug-b) by 2,000mm × 400mm."
    )
  })

  it("ignores items whose heights don't overlap (a TV above a sideboard)", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "sideboard",
        asset: "a-sideboard",
        position: { mode: "against", wall: "W2", at: 3000 },
      },
      {
        op: "add",
        id: "tv",
        asset: "a-tv",
        position: { mode: "onWall", wall: "W2", at: 3000, elevation: 1000 },
      },
    ])
    expect(codes(report)).not.toContain("E001")
  })
})

describe("E002 item overlaps a fixed obstacle", () => {
  it("treats the skirting as a thin obstacle along the wall", () => {
    const { report } = lintRealistic([{ op: "nudge", id: "sofa", dx: -18 }])
    expect(onlyIssue(report, "E002")).toMatchObject({
      placementIds: ["sofa"],
      featureIds: [],
      message:
        "Sofa overlaps the skirting on W6 by 18mm — it's pushed into the wall.",
      hint: "Move Sofa 18mm away from W6 (nudge sofa dx: 18).",
    })
  })

  it("lets rugs and items placed against the wall clear the skirting", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "rug",
        asset: "a-rug",
        position: { mode: "at", x: 1000, z: 3500 },
      },
      {
        op: "add",
        id: "sofa",
        asset: "a-sofa",
        position: { mode: "against", wall: "W6", at: 3500 },
      },
    ])
    expect(codes(report)).not.toContain("E002")
  })

  it("reports a radiator and a window sill under an item against the window wall", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "sideboard",
        asset: "a-sideboard",
        label: "Sideboard",
        position: { mode: "against", wall: "W5", at: 1000 },
      },
    ])
    const issues = issuesOf(report, "E002")
    expect(issues.map((i) => i.featureIds)).toEqual([["RAD1"], ["WIN1"]])
    expect(issues[0]!.message).toBe(
      "Sideboard overlaps radiator RAD1 (Radiator under window) by 1,400mm × 92mm."
    )
    expect(issues[0]!.hint).toBe(
      "Move Sideboard 92mm away from W5 (nudge sideboard dz: -92)."
    )
    expect(issues[1]!.message).toBe(
      "Sideboard overlaps the sill of window WIN1 by 1,600mm × 32mm."
    )
    // Tall-item-near-radiator/window warnings defer to the errors.
    expect(codes(report)).not.toContain("W103")
    expect(codes(report)).not.toContain("W104")
  })

  it("reports the pier and suggests sliding clear of it", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "sofa",
        asset: "a-sofa",
        position: { mode: "against", wall: "W6", at: 5000 },
      },
    ])
    expect(onlyIssue(report, "E002")).toMatchObject({
      featureIds: ["OB1"],
      message:
        "Test three-seat sofa overlaps pier OB1 (Wall pier) by 102mm × 1,000mm.",
      hint: "Move Test three-seat sofa 102mm away from W6 (nudge sofa dx: 102).",
    })
  })

  it("collides furniture — and rugs, which can't lie over it — with a hearth", () => {
    const hearth = {
      type: "hearth" as const,
      id: "H1",
      x: 1500,
      z: 3000,
      width: 1200,
      depth: 500,
      height: 50,
    }
    const { report } = lintOps(
      [
        {
          op: "add",
          id: "bench",
          asset: "a-bench",
          position: { mode: "at", x: 1500, z: 3300 },
        },
        {
          op: "add",
          id: "rug",
          asset: "a-rug",
          position: { mode: "at", x: 1500, z: 3600 },
        },
      ],
      {
        features: [...LIVING_ROOM_FEATURES, hearth],
        extraAssets: { "a-bench": boxAsset("Bench", [1000, 400, 450]) },
      }
    )
    const issues = issuesOf(report, "E002")
    expect(issues.map((i) => [i.placementIds, i.featureIds])).toEqual([
      [["bench"], ["H1"]],
      [["rug"], ["H1"]],
    ])
    expect(issues[0]!.message).toBe(
      "Bench overlaps hearth H1 by 1,000mm × 150mm."
    )
  })
})
