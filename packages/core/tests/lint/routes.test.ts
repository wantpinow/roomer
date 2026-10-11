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

// W101 (no walking route ≥ 700mm between two doors) and I202 (a route of
// 700–900mm). The route runs from D1 (kitchen, top) to D2 (hall, right).

const lounge: LayoutOp[] = [
  {
    op: "add",
    id: "sofa",
    asset: "a-sofa",
    label: "Sofa",
    position: { mode: "against", wall: "W6", at: 3800 },
  },
  {
    op: "add",
    id: "sideboard",
    asset: "a-sideboard",
    label: "Sideboard",
    position: { mode: "against", wall: "W2", at: 3890 },
  },
]
// Sofa front at x 968; sideboard front at x 2,512.

const coffeeTableAt = (x: number): LayoutOp => ({
  op: "add",
  id: "coffee-table",
  asset: "a-coffee-table",
  label: "Coffee table",
  position: { mode: "at", x, z: 3890, facing: 90 },
})

describe("W101/I202 walking routes between doors", () => {
  it("is quiet when the route is comfortably wide", () => {
    const { report } = lintRealistic()
    expect(codes(report)).not.toContain("W101")
    expect(codes(report)).not.toContain("I202")
  })

  it("reports a tight route (I202) with its exact width and pinch", () => {
    const { report } = lintRealistic([
      { op: "nudge", id: "coffee-table", dx: 350 },
    ])
    expect(onlyIssue(report, "I202")).toMatchObject({
      severity: "info",
      placementIds: ["sofa", "coffee-table"],
      featureIds: ["D1", "D2"],
      message:
        "The walking route between door D1 (Kitchen door) and door D2 (Hall door) narrows to 770mm between Sofa and Coffee table: usable, but 900mm is comfortable.",
      hint: "Move Coffee table 130mm towards W2 (nudge coffee-table dx: 130).",
    })
    expect(codes(report)).not.toContain("W101")
  })

  it("warns (W101) when every route is narrower than 700mm", () => {
    // 472mm either side of the coffee table.
    const { report } = lintOps([...lounge, coffeeTableAt(1740)])
    const issue = onlyIssue(report, "W101")
    expect(issue.message).toMatch(
      /^The walking route between door D1 \(Kitchen door\) and door D2 \(Hall door\) narrows to 472mm between (Sofa and Coffee table|Coffee table and Sideboard) — at least 700mm is needed\.$/
    )
    expect(issue.hint).toMatch(/^Move Coffee table 228mm towards W[26] /)
    expect(issue.at).toBeDefined()
  })

  it("says what blocks the way when there's no route at all", () => {
    const { report } = lintOps(
      [
        {
          op: "add",
          id: "bar",
          asset: "a-bar",
          position: { mode: "at", x: 1490, z: 3000 },
        },
      ],
      { extraAssets: { "a-bar": boxAsset("Bar", [2970, 200, 1100]) } }
    )
    expect(onlyIssue(report, "W101")).toMatchObject({
      placementIds: ["bar"],
      featureIds: ["D1", "D2"],
      message:
        "There's no walking route between door D1 (Kitchen door) and door D2 (Hall door): Bar blocks the way.",
      hint: "Open a gap at least 700mm wide there, e.g. by moving Bar.",
    })
  })

  it("ignores items above walking height and rugs", () => {
    const { report } = lintOps(
      [
        {
          op: "add",
          id: "shelf",
          asset: "a-shelf",
          position: { mode: "at", x: 1490, z: 3000, elevation: 1200 },
        },
        {
          op: "add",
          id: "rug",
          asset: "a-big-rug",
          position: { mode: "at", x: 1490, z: 3000 },
        },
      ],
      {
        extraAssets: {
          "a-shelf": boxAsset("High shelf", [2900, 300, 200], {
            mount: "floor",
          }),
          "a-big-rug": boxAsset("Big rug", [2900, 2000, 10], {
            mount: "floor-covering",
            category: "rug",
          }),
        },
      }
    )
    expect(codes(report)).not.toContain("W101")
    expect(codes(report)).not.toContain("I202")
  })

  it("needs two doors", () => {
    const features = LIVING_ROOM_FEATURES.filter((f) => f.id !== "D2")
    const { report } = lintOps(
      [
        {
          op: "add",
          id: "bar",
          asset: "a-bar",
          position: { mode: "at", x: 1490, z: 3000 },
        },
      ],
      { features, extraAssets: { "a-bar": boxAsset("Bar", [2970, 200, 1100]) } }
    )
    expect(issuesOf(report, "W101")).toEqual([])
  })

  it("uses the configured widths", () => {
    const { report } = lintRealistic([], {
      thresholds: { walkwayMinMm: 1200, walkwayComfortableMm: 1400 },
    })
    expect(onlyIssue(report, "W101").message).toContain(
      "at least 1,200mm is needed"
    )
  })
})
