import { describe, expect, it } from "vitest"

import {
  COFFEE_TABLE,
  DINING_CHAIR,
  PENDANT_LAMP,
  RUG,
  SIDEBOARD,
  SOFA,
  WALL_TV,
} from "../../src/fixtures"
import {
  applyOps,
  describePosition,
  OpError,
  type AssetResolver,
  type ResolvedAsset,
} from "../../src/placement"
import type { AssetSpec, LayoutOp, Placement } from "../../src/schema"
import { ROOM } from "./setup"

const SHORT_PENDANT: AssetSpec = {
  ...PENDANT_LAMP,
  name: "Short pendant",
  dims: { w: 400, d: 400, h: 600 },
  geometry: {
    kind: "parts",
    parts: [
      PENDANT_LAMP.geometry.parts[0]!,
      {
        shape: "cylinder",
        name: "cable",
        position: [0, 450, 0],
        radiusTop: 5,
        radiusBottom: 5,
        height: 300,
      },
    ],
  },
}

const LIBRARY: ResolvedAsset[] = [
  { id: "a-sofa", key: "test-three-seat-sofa", spec: SOFA },
  { id: "a-table", key: "test-coffee-table", spec: COFFEE_TABLE },
  { id: "a-rug", key: "test-rug", spec: RUG },
  { id: "a-chair", spec: DINING_CHAIR },
  { id: "a-sideboard", key: "test-sideboard", spec: SIDEBOARD },
  { id: "a-tv", key: "test-tv", spec: WALL_TV },
  { id: "a-pendant", key: "test-pendant", spec: PENDANT_LAMP },
  { id: "a-short-pendant", spec: SHORT_PENDANT },
]

const assets: AssetResolver = (ref) =>
  LIBRARY.find((a) => a.id === ref || a.key === ref)

const run = (ops: LayoutOp[], placements: Placement[] = []) =>
  applyOps({ room: ROOM, placements, ops, assets })

const expectOpError = (
  ops: LayoutOp[],
  placements: Placement[],
  expected: { index: number; code: OpError["code"]; message: string }
) => {
  let caught: unknown
  try {
    run(ops, placements)
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(OpError)
  if (!(caught instanceof OpError)) return
  expect(caught.index).toBe(expected.index)
  expect(caught.code).toBe(expected.code)
  expect(caught.message).toBe(expected.message)
}

const SOFA_ON_W6: Placement = {
  id: "sofa",
  assetId: "a-sofa",
  x: 493,
  z: 5290,
  facing: 90,
  elevation: 0,
}
const TABLE: Placement = {
  id: "coffee-table",
  assetId: "a-table",
  x: 1500,
  z: 5290,
  facing: 270,
  elevation: 0,
}

describe("applyOps: add", () => {
  it("resolves the position and records a readable change", () => {
    const { placements, changes } = run([
      {
        op: "add",
        id: "sofa",
        asset: "a-sofa",
        position: { mode: "against", wall: "W6", at: 2400 },
      },
    ])
    expect(placements).toEqual([SOFA_ON_W6])
    expect(changes).toEqual([
      {
        index: 0,
        op: "add",
        id: "sofa",
        summary: "Added Test three-seat sofa (sofa) against W6 at 2,400mm",
      },
    ])
  })

  it("derives ids from the asset name and numbers repeats", () => {
    const addChair = (x: number): LayoutOp => ({
      op: "add",
      asset: "a-chair",
      position: { mode: "at", x, z: 3000 },
    })
    const { placements } = run([addChair(500), addChair(1000), addChair(1500)])
    expect(placements.map((p) => p.id)).toEqual([
      "test-dining-chair",
      "test-dining-chair-2",
      "test-dining-chair-3",
    ])
  })

  it("accepts an asset key and stores the asset id", () => {
    const { placements } = run([
      {
        op: "add",
        asset: "test-three-seat-sofa",
        position: { mode: "at", x: 1500, z: 3000 },
      },
    ])
    expect(placements[0]).toMatchObject({
      id: "test-three-seat-sofa",
      assetId: "a-sofa",
    })
  })

  it("stores a label and mirroring, and skips them when empty", () => {
    const { placements } = run([
      {
        op: "add",
        id: "sofa",
        asset: "a-sofa",
        label: "Main sofa",
        mirrored: true,
        position: { mode: "at", x: 1500, z: 3000 },
      },
      {
        op: "add",
        id: "chair",
        asset: "a-chair",
        label: "",
        mirrored: false,
        position: { mode: "at", x: 500, z: 3000 },
      },
    ])
    expect(placements[0]).toMatchObject({ label: "Main sofa", mirrored: true })
    expect(placements[1]).not.toHaveProperty("label")
    expect(placements[1]).not.toHaveProperty("mirrored")
  })

  it("lets later ops target items added earlier in the batch", () => {
    const { placements, changes } = run([
      {
        op: "add",
        id: "coffee-table",
        asset: "a-table",
        position: { mode: "at", x: 1500, z: 5290, facing: 270 },
      },
      {
        op: "add",
        id: "rug",
        asset: "a-rug",
        position: { mode: "centerOn", placement: "coffee-table" },
      },
    ])
    expect(placements[1]).toMatchObject({ x: 1500, z: 5290, facing: 270 })
    expect(changes[1]!.summary).toBe(
      "Added Test rug (rug) centred on coffee-table"
    )
  })

  it("rejects a duplicate explicit id", () => {
    expectOpError(
      [
        {
          op: "add",
          id: "sofa",
          asset: "a-sofa",
          position: { mode: "at", x: 0, z: 0 },
        },
      ],
      [SOFA_ON_W6],
      {
        index: 0,
        code: "DUPLICATE_ID",
        message:
          "ops[0] (add): a placement with id 'sofa' already exists. Choose another id, or leave id out to get a fresh one.",
      }
    )
  })

  it("rejects an unknown asset", () => {
    expectOpError(
      [{ op: "add", asset: "nope", position: { mode: "at", x: 0, z: 0 } }],
      [],
      {
        index: 0,
        code: "UNKNOWN_ASSET",
        message:
          "ops[0] (add): no asset 'nope'. Use an asset id or key from search_assets.",
      }
    )
  })

  it("passes placement errors through with the op's index", () => {
    expectOpError(
      [
        { op: "remove", id: "sofa" },
        {
          op: "add",
          asset: "a-sofa",
          position: { mode: "against", wall: "W9", at: 100 },
        },
      ],
      [SOFA_ON_W6],
      {
        index: 1,
        code: "UNKNOWN_WALL",
        message:
          "ops[1] (add): Wall W9 doesn't exist — this room has walls W1–W6.",
      }
    )
  })
})

describe("applyOps: move", () => {
  it("re-resolves the position and keeps label and mirroring", () => {
    const { placements, changes } = run(
      [
        {
          op: "move",
          id: "sofa",
          position: { mode: "against", wall: "W2", at: 2400 },
        },
      ],
      [{ ...SOFA_ON_W6, label: "Main sofa", mirrored: true }]
    )
    expect(placements).toEqual([
      {
        id: "sofa",
        assetId: "a-sofa",
        label: "Main sofa",
        x: 2487,
        z: 2400,
        facing: 270,
        elevation: 0,
        mirrored: true,
      },
    ])
    expect(changes[0]!.summary).toBe("Moved sofa against W2 at 2,400mm")
  })

  it("lists the existing ids when the target is unknown", () => {
    expectOpError(
      [
        { op: "nudge", id: "sofa", dx: 10 },
        { op: "nudge", id: "sofa", dx: 10 },
        {
          op: "move",
          id: "sofa-2",
          position: { mode: "at", x: 0, z: 0 },
        },
      ],
      [SOFA_ON_W6, TABLE],
      {
        index: 2,
        code: "UNKNOWN_PLACEMENT",
        message:
          "ops[2] (move): no placement with id 'sofa-2'. Existing ids: sofa, coffee-table.",
      }
    )
  })

  it("can't centre an item on itself", () => {
    expectOpError(
      [
        {
          op: "move",
          id: "sofa",
          position: { mode: "centerOn", placement: "sofa" },
        },
      ],
      [SOFA_ON_W6],
      {
        index: 0,
        code: "SELF_TARGET",
        message:
          "ops[0] (move): 'sofa' can't be centred on itself; use nudge to shift it, or centre it on another placement.",
      }
    )
  })

  it("reports a placement whose asset has gone", () => {
    expectOpError(
      [{ op: "move", id: "ghost", position: { mode: "at", x: 0, z: 0 } }],
      [{ ...SOFA_ON_W6, id: "ghost", assetId: "a-missing" }],
      {
        index: 0,
        code: "UNKNOWN_ASSET",
        message:
          "ops[0] (move): the asset of 'ghost' (a-missing) can't be found; swap it for an existing asset or remove it.",
      }
    )
  })
})

describe("applyOps: nudge", () => {
  const nudge = (op: Omit<Extract<LayoutOp, { op: "nudge" }>, "op" | "id">) =>
    run([{ op: "nudge", id: "sofa", ...op }], [SOFA_ON_W6])

  it("shifts in world mm and says which way on the plan", () => {
    const right = nudge({ dx: 150 })
    expect(right.placements[0]).toMatchObject({ x: 643, z: 5290 })
    expect(right.changes[0]!.summary).toBe("Moved sofa 150mm right")
    expect(nudge({ dx: -20, dz: -50 }).changes[0]!.summary).toBe(
      "Moved sofa 20mm left and 50mm up"
    )
  })

  it("rotates clockwise about the centre, normalising the facing", () => {
    const quarter = nudge({ rotate: 90 })
    expect(quarter.placements[0]).toMatchObject({
      x: 493,
      z: 5290,
      facing: 180,
    })
    expect(quarter.changes[0]!.summary).toBe("Rotated sofa 90° clockwise")
    const back = nudge({ rotate: -135 })
    expect(back.placements[0]!.facing).toBe(315)
    expect(back.changes[0]!.summary).toBe("Rotated sofa 135° anticlockwise")
  })

  it("combines a shift and a turn in one sentence", () => {
    expect(nudge({ dx: 150, dz: 50, rotate: 90 }).changes[0]!.summary).toBe(
      "Moved sofa 150mm right and 50mm down and turned it 90° clockwise"
    )
  })

  it("says when there was nothing to do", () => {
    const { placements, changes } = nudge({})
    expect(placements).toEqual([SOFA_ON_W6])
    expect(changes[0]!.summary).toBe(
      "Left sofa where it was (nothing to nudge)"
    )
  })
})

describe("applyOps: swap", () => {
  it("keeps the centre, facing and elevation", () => {
    const { placements, changes } = run(
      [{ op: "swap", id: "sofa", asset: "test-sideboard" }],
      [{ ...SOFA_ON_W6, elevation: 20 }]
    )
    expect(placements[0]).toEqual({
      ...SOFA_ON_W6,
      assetId: "a-sideboard",
      elevation: 20,
    })
    expect(changes[0]!.summary).toBe("Swapped sofa for Test sideboard")
  })

  it("re-hangs ceiling items from the ceiling", () => {
    const pendant: Placement = {
      id: "pendant",
      assetId: "a-pendant",
      x: 1490,
      z: 2400,
      facing: 180,
      elevation: 1550,
    }
    const { placements } = run(
      [{ op: "swap", id: "pendant", asset: "a-short-pendant" }],
      [pendant]
    )
    expect(placements[0]).toMatchObject({
      assetId: "a-short-pendant",
      elevation: 2450 - 600,
    })
  })

  it("rejects an unknown replacement", () => {
    expectOpError([{ op: "swap", id: "sofa", asset: "nope" }], [SOFA_ON_W6], {
      index: 0,
      code: "UNKNOWN_ASSET",
      message:
        "ops[0] (swap): no asset 'nope'. Use an asset id or key from search_assets.",
    })
  })
})

describe("applyOps: set", () => {
  it("labels, clears labels and (un)mirrors", () => {
    const labelled = run(
      [{ op: "set", id: "sofa", label: "Main sofa" }],
      [SOFA_ON_W6]
    )
    expect(labelled.placements[0]!.label).toBe("Main sofa")
    expect(labelled.changes[0]!.summary).toBe('Labelled sofa "Main sofa"')

    const cleared = run(
      [{ op: "set", id: "sofa", label: "" }],
      [{ ...SOFA_ON_W6, label: "Main sofa" }]
    )
    expect(cleared.placements[0]).not.toHaveProperty("label")
    expect(cleared.changes[0]!.summary).toBe("Cleared sofa's label")

    const mirrored = run(
      [{ op: "set", id: "sofa", mirrored: true }],
      [SOFA_ON_W6]
    )
    expect(mirrored.placements[0]!.mirrored).toBe(true)
    expect(mirrored.changes[0]!.summary).toBe("Mirrored sofa")

    const unmirrored = run(
      [{ op: "set", id: "sofa", mirrored: false }],
      [{ ...SOFA_ON_W6, mirrored: true }]
    )
    expect(unmirrored.placements[0]).not.toHaveProperty("mirrored")
    expect(unmirrored.changes[0]!.summary).toBe("Un-mirrored sofa")
  })

  it("describes a label and mirroring change together", () => {
    const { changes } = run(
      [{ op: "set", id: "sofa", label: "Main sofa", mirrored: true }],
      [SOFA_ON_W6]
    )
    expect(changes[0]!.summary).toBe(
      'Labelled sofa "Main sofa" and mirrored it'
    )
  })

  it("rejects a set with nothing to change", () => {
    expectOpError([{ op: "set", id: "sofa" }], [SOFA_ON_W6], {
      index: 0,
      code: "NOTHING_TO_SET",
      message:
        "ops[0] (set): nothing to change on 'sofa'. Give a label (empty string clears it) and/or mirrored.",
    })
  })
})

describe("applyOps: remove", () => {
  it("removes the placement", () => {
    const { placements, changes } = run(
      [{ op: "remove", id: "coffee-table" }],
      [SOFA_ON_W6, TABLE]
    )
    expect(placements).toEqual([SOFA_ON_W6])
    expect(changes).toEqual([
      {
        index: 0,
        op: "remove",
        id: "coffee-table",
        summary: "Removed coffee-table",
      },
    ])
  })

  it("says the layout is empty when there is nothing to remove", () => {
    expectOpError([{ op: "remove", id: "rug" }], [], {
      index: 0,
      code: "UNKNOWN_PLACEMENT",
      message:
        "ops[0] (remove): no placement with id 'rug'. Existing ids: none (the layout is empty).",
    })
  })
})

describe("applyOps: batches", () => {
  it("applies ops in order, each seeing the previous ones", () => {
    const { placements, changes } = run(
      [
        { op: "nudge", id: "sofa", dz: 100 },
        {
          op: "move",
          id: "coffee-table",
          position: { mode: "centerOn", placement: "sofa", dx: 1000 },
        },
        { op: "remove", id: "sofa" },
      ],
      [SOFA_ON_W6, TABLE]
    )
    expect(placements).toEqual([{ ...TABLE, x: 1493, z: 5390, facing: 90 }])
    expect(changes.map((c) => [c.index, c.op, c.id])).toEqual([
      [0, "nudge", "sofa"],
      [1, "move", "coffee-table"],
      [2, "remove", "sofa"],
    ])
  })

  it("never mutates its input", () => {
    const input = [{ ...SOFA_ON_W6 }]
    const snapshot = structuredClone(input)
    run(
      [
        { op: "nudge", id: "sofa", dx: 10 },
        { op: "set", id: "sofa", label: "x" },
      ],
      input
    )
    expect(input).toEqual(snapshot)
  })
})

describe("describePosition", () => {
  it("phrases every placement mode", () => {
    expect(describePosition({ mode: "at", x: 1000, z: 2000 })).toBe(
      "at (1,000, 2,000)"
    )
    expect(
      describePosition({
        mode: "against",
        wall: "W6",
        at: 1000,
        side: "left",
        anchor: "start-edge",
      })
    ).toBe("with its left side against W6 at 1,000mm (start-edge)")
    expect(
      describePosition({
        mode: "onWall",
        wall: "W2",
        at: 3000,
        elevation: 1200,
      })
    ).toBe("on W2 at 3,000mm, 1,200mm up")
    expect(
      describePosition({ mode: "centerOn", feature: "L1", dx: 100, dz: -50 })
    ).toBe("centred on L1 offset by (100, -50)")
    expect(describePosition({ mode: "inCorner", corner: "C1" })).toBe(
      "in corner C1"
    )
  })
})
