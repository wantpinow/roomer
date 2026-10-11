import { describe, expect, it } from "vitest"

import { codes, issuesOf, lintOps, lintRealistic, onlyIssue } from "./helpers"

// E003 (item outside the room / through a wall) and E006 (item can't
// physically be there).

describe("E003 item outside the room", () => {
  it("says which wall the item goes through, by how much, and how far to move", () => {
    const { report } = lintRealistic([{ op: "nudge", id: "sofa", dx: -120 }])
    expect(onlyIssue(report, "E003")).toMatchObject({
      placementIds: ["sofa"],
      message: "Sofa goes 102mm through W6 — part of it is outside the room.",
      // 102mm back inside plus the 18mm skirting.
      hint: "Move Sofa 120mm away from W6 (nudge sofa dx: 120).",
    })
    // The skirting overlap on that wall is part of the same problem.
    expect(codes(report)).not.toContain("E002")
  })

  it("names both walls at the notch and suggests the shorter way out", () => {
    // 1,100 × 600 coffee table across the inside corner C4 (2,170, 7,090).
    const { report } = lintOps([
      {
        op: "add",
        id: "table",
        asset: "a-coffee-table",
        position: { mode: "at", x: 2000, z: 7150 },
      },
    ])
    const issue = onlyIssue(report, "E003")
    expect(issue.message).toBe(
      "Test coffee table goes through W4 (380mm) and W3 (360mm) — part of it is outside the room."
    )
    expect(issue.hint).toBe(
      "Move Test coffee table 378mm away from W3 (nudge table dz: -378)."
    )
  })

  it("combines walls when one move isn't enough (a corner)", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "table",
        asset: "a-coffee-table",
        position: { mode: "at", x: 500, z: 250 },
      },
    ])
    const issue = onlyIssue(report, "E003")
    expect(issue.message).toBe(
      "Test coffee table goes through W1 (50mm) and W6 (50mm) — part of it is outside the room."
    )
    expect(issue.hint).toBe(
      "Move Test coffee table away from W1 and W6 (nudge table dx: 68, dz: 68)."
    )
  })

  it("accepts items flush with the plaster or fully inside", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "rug",
        asset: "a-rug",
        position: { mode: "at", x: 1000, z: 700 },
      },
    ])
    expect(codes(report)).not.toContain("E003")
    expect(issuesOf(lintRealistic().report, "E003")).toEqual([])
  })
})

describe("E006 item can't physically sit there", () => {
  it("flags an item that reaches above the ceiling", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "sideboard",
        asset: "a-sideboard",
        position: { mode: "at", x: 1500, z: 3000, elevation: 1800 },
      },
    ])
    expect(onlyIssue(report, "E006")).toMatchObject({
      message:
        "Test sideboard reaches 2,550mm, 100mm above the 2,450mm ceiling.",
      hint: "Lower Test sideboard by 100mm (elevation 1700).",
      at: [1500, 3000],
    })
  })

  it("flags a wall-mounted item that isn't against a wall", () => {
    const { report } = lintRealistic([{ op: "nudge", id: "tv", dx: -300 }])
    expect(onlyIssue(report, "E006")).toMatchObject({
      placementIds: ["tv"],
      message:
        "TV is wall-mounted, but its back is 300mm from W2, so it would hang in mid-air.",
      hint: 'Hang it on the wall: move tv to { mode: "onWall", wall: "W2", at: 4220, elevation: 1000 }.',
    })
  })

  it("flags a wall item turned away from the wall", () => {
    const { report } = lintRealistic([{ op: "nudge", id: "tv", rotate: 90 }])
    expect(onlyIssue(report, "E006").message).toMatch(
      /^TV is wall-mounted, but its back is .* from W2 and it faces 0° rather than 270° \(out from W2\)/
    )
  })

  it("accepts a TV hung with onWall, within the mounting tolerance", () => {
    expect(codes(lintRealistic().report)).not.toContain("E006")
    const { report } = lintRealistic([{ op: "nudge", id: "tv", dx: -20 }])
    expect(codes(report)).not.toContain("E006")
  })

  it("flags a ceiling item that doesn't reach the ceiling", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "lamp",
        asset: "a-pendant",
        position: { mode: "at", x: 1500, z: 3000, elevation: 1000 },
      },
    ])
    expect(onlyIssue(report, "E006")).toMatchObject({
      message:
        "Test pendant lamp hangs from the ceiling, but its top is 550mm below it, so nothing holds it up.",
      hint: "Set lamp's elevation to 1550 so its top meets the ceiling (or pick a longer drop).",
    })
  })

  it("accepts a pendant hung from a ceiling fitting", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "lamp",
        asset: "a-pendant",
        position: { mode: "centerOn", feature: "L1" },
      },
    ])
    expect(report.issues).toEqual([])
  })
})
