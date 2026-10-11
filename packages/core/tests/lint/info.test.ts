import { describe, expect, it } from "vitest"

import { LIVING_ROOM_FEATURES } from "../../src/fixtures"
import type { Feature } from "../../src/schema"
import {
  boxAsset,
  codes,
  issuesOf,
  lintOps,
  lintRealistic,
  onlyIssue,
} from "./helpers"

// I201 (outlets hidden behind items) and I203 (awkward narrow gaps).

describe("I201 hidden sockets", () => {
  it("lists the sockets an item hides, with a way to uncover them", () => {
    const { report } = lintRealistic()
    expect(onlyIssue(report, "I201")).toMatchObject({
      severity: "info",
      placementIds: ["sideboard"],
      featureIds: ["S1"],
      message: "Sideboard hides socket S1 — you may still need to reach it.",
      hint: "Plug in before placing it, or uncover it: move Sideboard 132mm towards W2 (nudge sideboard dx: 132).",
      at: [0, 6617],
    })
  })

  it("lists several sockets on one item", () => {
    const { report } = lintOps(
      [
        {
          op: "add",
          id: "unit",
          asset: "a-unit",
          position: { mode: "against", wall: "W2", at: 3070 },
        },
      ],
      { extraAssets: { "a-unit": boxAsset("Wall unit", [3400, 400, 900]) } }
    )
    expect(onlyIssue(report, "I201")).toMatchObject({
      featureIds: ["S3", "S4"],
      message:
        "Wall unit hides socket S3 and socket S4 — you may still need to reach them.",
    })
  })

  it("ignores items above the socket and rugs over a wall socket", () => {
    // The realistic TV hangs over S4; the rug here runs under S2.
    const { report } = lintOps([
      {
        op: "add",
        id: "tv",
        asset: "a-tv",
        position: { mode: "onWall", wall: "W2", at: 4570, elevation: 1000 },
      },
      {
        op: "add",
        id: "rug",
        asset: "a-rug",
        position: { mode: "at", x: 720, z: 1620 },
      },
    ])
    expect(issuesOf(report, "I201")).toEqual([])
  })

  it("counts a floor socket under a rug as hidden", () => {
    const floorSocket: Feature = {
      type: "floor-socket",
      id: "FS1",
      x: 1500,
      z: 4000,
      width: 120,
      depth: 120,
      height: 20,
    }
    const { report } = lintOps(
      [
        {
          op: "add",
          id: "rug",
          asset: "a-rug",
          label: "Rug",
          position: { mode: "at", x: 1500, z: 4100 },
        },
      ],
      { features: [...LIVING_ROOM_FEATURES, floorSocket] }
    )
    expect(onlyIssue(report, "I201")).toMatchObject({
      featureIds: ["FS1"],
      message: "Rug hides floor socket FS1 — you may still need to reach it.",
      at: [1500, 4000],
    })
  })
})

describe("I203 awkward gaps", () => {
  it("flags an item standing a little way off a wall", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "sb",
        asset: "a-sideboard",
        position: { mode: "against", wall: "W6", at: 4000, gap: 150 },
      },
    ])
    expect(onlyIssue(report, "I203")).toMatchObject({
      placementIds: ["sb"],
      message:
        "There's a 150mm gap between Test sideboard and W6 — gaps this narrow collect dust and look accidental.",
      hint: "Close it (nudge sb dx: -150) or open it up to at least 300mm.",
    })
  })

  it("flags a narrow gap between two pieces of furniture side by side", () => {
    const { report } = lintOps([
      {
        op: "add",
        id: "a",
        asset: "a-sideboard",
        position: { mode: "against", wall: "W6", at: 1000 },
      },
      {
        op: "add",
        id: "b",
        asset: "a-sideboard",
        position: { mode: "against", wall: "W6", at: 2800 },
      },
    ])
    expect(onlyIssue(report, "I203")).toMatchObject({
      placementIds: ["a", "b"],
      message:
        "There's a 200mm gap between Test sideboard (a) and Test sideboard (b) — gaps this narrow collect dust and look accidental.",
    })
  })

  it("leaves wide and tight gaps alone", () => {
    for (const gap of [40, 320]) {
      const { report } = lintOps([
        {
          op: "add",
          id: "sb",
          asset: "a-sideboard",
          position: { mode: "against", wall: "W6", at: 4000, gap },
        },
      ])
      expect(codes(report)).not.toContain("I203")
    }
  })

  it("ignores gaps that have something in them, and functional ones", () => {
    // 150mm off W6 but the pier fills the gap; chairs at a table; a sofa's
    // legroom side (that's W102's business).
    const { report } = lintOps([
      {
        op: "add",
        id: "sb",
        asset: "a-sideboard",
        position: { mode: "against", wall: "W6", at: 5420, gap: 150 },
      },
      {
        op: "add",
        id: "table",
        asset: "a-dining-table",
        position: { mode: "at", x: 1500, z: 6000 },
      },
      {
        op: "add",
        id: "chair",
        asset: "a-chair",
        position: { mode: "at", x: 1500, z: 5400 },
      },
    ])
    expect(codes(report)).not.toContain("I203")
    const legroom = lintRealistic([
      { op: "nudge", id: "coffee-table", dx: -150 },
    ])
    expect(codes(legroom.report)).not.toContain("I203")
    expect(codes(legroom.report)).toContain("W102")
  })
})
