import { describe, expect, it } from "vitest"

import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_SKIRTING,
  TEST_ASSETS,
} from "@roomer/core/fixtures"
import type { RoomGeometry } from "@roomer/core/geometry"
import type { LintIssue, Placement } from "@roomer/core/schema"

import {
  addOpFor,
  boundsOutline,
  boundsSpec,
  decidePlacement,
  defaultWallElevation,
  describeDecision,
  GHOST_ID,
  ghostPlacement,
  ghostVerdict,
  placeOutline,
  resolveGhost,
  turnFacing,
} from "../placing"

// The living room: x 0..2980, z 0..7690 (notched at the window end). W1 is
// the top wall, W2 the right, W6 the long left wall (x = 0, running C6 →
// C1, i.e. up the page). Pendants L1 (1490, 2400) and L2 (1490, 5600).
const room: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
}
const sofa = TEST_ASSETS.sofa // 2200 × 950 × 820
const rug = TEST_ASSETS.rug
const tv = TEST_ASSETS.wallTv // 1450 × 40 × 840
const pendant = TEST_ASSETS.pendantLamp

describe("defaultWallElevation", () => {
  it("puts a TV's centre at 1100mm", () => {
    expect(defaultWallElevation(tv)).toBe(1100 - 420)
  })

  it("hangs art and mirrors at 1450, shelves at 1200, lights at 1700", () => {
    const at = (category: "decor" | "storage" | "lighting" | "other") =>
      defaultWallElevation({ category, dims: { w: 600, d: 30, h: 600 } })
    expect(at("decor")).toBe(1150)
    expect(at("other")).toBe(1150)
    expect(at("storage")).toBe(900)
    expect(at("lighting")).toBe(1400)
  })

  it("never goes below the floor", () => {
    expect(
      defaultWallElevation({ category: "media", dims: { w: 1, d: 1, h: 2600 } })
    ).toBe(0)
  })
})

describe("decidePlacement", () => {
  it("snaps a floor item near a wall back-to-wall, centred where pointed", () => {
    const decision = decidePlacement({
      asset: sofa,
      pointer: [600, 3004],
      facing: 180,
      room,
    })
    // W6 runs from C6 (0, 7690) up to C1 (0, 0): along = 7690 − z.
    expect(decision.position).toEqual({
      mode: "against",
      wall: "W6",
      at: 4690,
      anchor: "center",
    })
    expect(decision.snap).toMatchObject({ kind: "wall", along: 4690 })
    const pose = resolveGhost(decision, sofa, room, [])
    expect(pose).toMatchObject({
      facing: 90,
      x: LIVING_ROOM_SKIRTING.depth + 950 / 2,
      z: 3000,
    })
  })

  it("leaves a floor item where pointed, turned, when no wall is near", () => {
    const decision = decidePlacement({
      asset: sofa,
      pointer: [1494, 3333],
      facing: 450,
      room,
    })
    expect(decision).toEqual({
      position: { mode: "at", x: 1490, z: 3330, facing: 90 },
      snap: { kind: "free" },
    })
  })

  it("places freely to the millimetre with Alt", () => {
    const decision = decidePlacement({
      asset: sofa,
      pointer: [1494.4, 3333.6],
      facing: 180,
      room,
      free: true,
    })
    expect(decision.position).toMatchObject({ x: 1494, z: 3334 })
  })

  it("keeps a wall-snapped item between the wall's ends", () => {
    const decision = decidePlacement({
      asset: sofa,
      pointer: [300, 6800],
      facing: 180,
      room,
    })
    // 890 up W6 from C6: the 2200 sofa can't centre closer than 1100 to
    // the corner, so it slides along to fit.
    expect(decision.position).toMatchObject({
      mode: "against",
      wall: "W6",
      at: 1100,
    })
  })

  it("never snaps a rug to a wall", () => {
    const decision = decidePlacement({
      asset: rug,
      pointer: [100, 3000],
      facing: 180,
      room,
    })
    expect(decision.position.mode).toBe("at")
    expect(decision.snap.kind).toBe("free")
  })

  it("always puts a wall item on the nearest wall at a default height", () => {
    const decision = decidePlacement({
      asset: tv,
      pointer: [2500, 4000],
      facing: 180,
      room,
    })
    // W2 is the right wall, x = 2980, running C2 (2980, 0) → C3 down the page.
    expect(decision.position).toEqual({
      mode: "onWall",
      wall: "W2",
      at: 4000,
      elevation: 680,
    })
    const pose = resolveGhost(decision, tv, room, [])
    expect(pose).toMatchObject({ facing: 270, elevation: 680, z: 4000 })
  })

  it("centres a ceiling item on a fitting within 600mm", () => {
    const decision = decidePlacement({
      asset: pendant,
      pointer: [1700, 2700],
      facing: 180,
      room,
    })
    expect(decision.position).toMatchObject({ mode: "centerOn", feature: "L1" })
    expect(decision.snap).toEqual({
      kind: "feature",
      featureId: "L1",
      at: [1490, 2400],
    })
    const pose = resolveGhost(decision, pendant, room, [])
    expect(pose).toMatchObject({ x: 1490, z: 2400 })
  })

  it("hangs a ceiling item where pointed when no fitting is near", () => {
    const decision = decidePlacement({
      asset: pendant,
      pointer: [1490, 4000],
      facing: 180,
      room,
    })
    expect(decision.position.mode).toBe("at")
    const pose = resolveGhost(decision, pendant, room, [])
    // Core hangs it from the ceiling.
    expect(pose?.elevation).toBeGreaterThan(0)
  })
})

describe("resolveGhost", () => {
  it("returns null when core refuses the position", () => {
    expect(
      resolveGhost(
        {
          position: { mode: "against", wall: "W99", at: 0 },
          snap: { kind: "free" },
        },
        sofa,
        room,
        []
      )
    ).toBeNull()
  })
})

describe("boundsSpec", () => {
  it("resolves like the real model for wall snaps", () => {
    const decision = decidePlacement({
      asset: sofa,
      pointer: [600, 3000],
      facing: 180,
      room,
    })
    expect(resolveGhost(decision, boundsSpec(sofa), room, [])).toEqual(
      resolveGhost(decision, sofa, room, [])
    )
  })
})

describe("placeOutline and boundsOutline", () => {
  it("moves an item-local outline to the pose", () => {
    const [ring] = placeOutline(boundsOutline(TEST_ASSETS.coffeeTable), {
      x: 1000,
      z: 2000,
      facing: 180,
      elevation: 0,
    })
    const xs = ring!.map(([x]) => x)
    expect(Math.min(...xs)).toBeCloseTo(450)
    expect(Math.max(...xs)).toBeCloseTo(1550)
  })
})

describe("ghostVerdict", () => {
  const issue = (
    code: LintIssue["code"],
    severity: LintIssue["severity"],
    ids: string[]
  ): LintIssue => ({
    code,
    severity,
    message: code,
    placementIds: ids,
    featureIds: [],
  })

  it("reports the worst issue the ghost is part of", () => {
    const verdict = ghostVerdict({
      ok: false,
      counts: { error: 2, warning: 1, info: 0 },
      issues: [
        issue("W103", "warning", [GHOST_ID]),
        issue("E001", "error", ["sofa", "table"]),
        issue("E003", "error", [GHOST_ID]),
      ],
    })
    expect(verdict.severity).toBe("error")
    expect(verdict.issue?.code).toBe("E003")
  })

  it("is clear when the ghost causes nothing", () => {
    expect(
      ghostVerdict({
        ok: true,
        counts: { error: 0, warning: 0, info: 0 },
        issues: [issue("E001", "error", ["a", "b"])],
      })
    ).toEqual({ severity: null, issue: undefined })
    expect(ghostVerdict(undefined).severity).toBeNull()
  })
})

describe("ghostPlacement", () => {
  it("wears the ghost id and the asset's name", () => {
    const ghost: Placement = ghostPlacement("a1", "Arlo Armchair", {
      x: 1,
      z: 2,
      facing: 90,
      elevation: 0,
    })
    expect(ghost).toEqual({
      id: GHOST_ID,
      assetId: "a1",
      label: "Arlo Armchair",
      x: 1,
      z: 2,
      facing: 90,
      elevation: 0,
    })
  })
})

describe("addOpFor", () => {
  it("derives a readable id unique in the layout", () => {
    const position = { mode: "at", x: 0, z: 0 } as const
    expect(addOpFor("a1", "Anya Dining Chair", position, [])).toEqual({
      op: "add",
      id: "anya-dining-chair",
      asset: "a1",
      position,
    })
    expect(
      addOpFor("a1", "Anya Dining Chair", position, [
        "anya-dining-chair",
        "anya-dining-chair-2",
      ]).id
    ).toBe("anya-dining-chair-3")
  })
})

describe("turnFacing", () => {
  it("turns clockwise and wraps", () => {
    expect(turnFacing(180, 90)).toBe(270)
    expect(turnFacing(270, 90)).toBe(0)
    expect(turnFacing(0, -15)).toBe(345)
  })
})

describe("describeDecision", () => {
  const pose = { facing: 90, elevation: 0 }
  const free = { kind: "free" } as const

  it("reads each kind of snap", () => {
    expect(
      describeDecision(
        { position: { mode: "against", wall: "W6", at: 100 }, snap: free },
        pose
      )
    ).toBe("Back to W6")
    expect(
      describeDecision(
        {
          position: { mode: "onWall", wall: "W2", at: 100, elevation: 680 },
          snap: free,
        },
        pose
      )
    ).toBe("On W2 · bottom at 680 mm")
    expect(
      describeDecision(
        { position: { mode: "centerOn", feature: "L1" }, snap: free },
        pose
      )
    ).toBe("Centred on L1")
  })

  it("says how a free item faces, or how high it hangs", () => {
    const at = { position: { mode: "at", x: 0, z: 0 }, snap: free } as const
    expect(describeDecision(at, pose)).toBe("Free · facing 90°")
    expect(describeDecision(at, { facing: 180, elevation: 1450 })).toBe(
      "Free · 1,450 mm up"
    )
  })
})
