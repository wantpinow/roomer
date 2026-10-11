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
  cornerAngles,
  placementTransform,
  type RoomGeometry,
} from "../../src/geometry"
import {
  PlacementError,
  placementContext,
  resolvePosition,
  worldShapes,
} from "../../src/placement"
import type { AssetSpec, Placement, PlacementPosition } from "../../src/schema"
import {
  expectFlush,
  gapToWall,
  livingRoom,
  ROOM,
  SKIRTING_DEPTH,
} from "./setup"

/** A bench whose parts sit 100mm left of its origin (x −1100…900). */
const LOPSIDED: AssetSpec = {
  name: "Lopsided bench",
  category: "other",
  mount: "floor",
  dims: { w: 2000, d: 400, h: 450 },
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "box",
        name: "seat",
        position: [-100, 225, 0],
        size: [2000, 450, 400],
      },
    ],
  },
}

const resolve = (
  position: PlacementPosition,
  asset: AssetSpec,
  options: { mirrored?: boolean; placements?: Placement[]; self?: string } = {}
) =>
  resolvePosition(position, asset, livingRoom(options.placements), {
    mirrored: options.mirrored,
    self: options.self,
  })

const expectPlacementError = (
  run: () => unknown,
  code: PlacementError["code"],
  message: string
) => {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(PlacementError)
  if (!(caught instanceof PlacementError)) return
  expect(caught.code).toBe(code)
  expect(caught.message).toBe(message)
}

describe("resolvePosition: at", () => {
  it("uses the given centre, facing down the page by default", () => {
    expect(resolve({ mode: "at", x: 1000, z: 2000 }, SOFA)).toEqual({
      x: 1000,
      z: 2000,
      facing: 180,
      elevation: 0,
    })
  })

  it("normalises the facing to [0, 360) and 0.01°", () => {
    const facing = (f: number) =>
      resolve({ mode: "at", x: 0, z: 0, facing: f }, SOFA).facing
    expect(facing(-90)).toBe(270)
    expect(facing(450.004)).toBe(90)
    expect(facing(359.996)).toBe(0)
    expect(facing(12.345)).toBe(12.35)
  })

  it("keeps an explicit elevation", () => {
    expect(
      resolve({ mode: "at", x: 0, z: 0, elevation: 750 }, COFFEE_TABLE)
        .elevation
    ).toBe(750)
  })

  it("hangs ceiling items from the ceiling by default", () => {
    // 2,450mm ceiling − 900mm lamp.
    expect(
      resolve({ mode: "at", x: 1490, z: 2400 }, PENDANT_LAMP).elevation
    ).toBe(1550)
  })

  it("refuses to guess an elevation for wall-mounted items", () => {
    expectPlacementError(
      () => resolve({ mode: "at", x: 1000, z: 50 }, WALL_TV),
      "NEEDS_ON_WALL",
      'Test 65in TV is wall-mounted: place it with mode "onWall" (wall, at, elevation) rather than "at", or give an explicit elevation.'
    )
    expect(
      resolve({ mode: "at", x: 1000, z: 50, elevation: 1200 }, WALL_TV)
        .elevation
    ).toBe(1200)
  })

  it("rejects ceiling items taller than the room", () => {
    const low = placementContext({ ...ROOM, ceilingHeight: 800 })
    expectPlacementError(
      () => resolvePosition({ mode: "at", x: 0, z: 0 }, PENDANT_LAMP, low),
      "TOO_TALL",
      "Test pendant lamp is 900mm tall, more than the 800mm ceiling, so it can't hang from it."
    )
  })
})

describe("resolvePosition: against", () => {
  it("puts the back against the left wall (W6), clear of the skirting", () => {
    const pose = resolve({ mode: "against", wall: "W6", at: 2400 }, SOFA)
    // W6 runs up the page along x = 0; along 2,400mm is z = 7,690 − 2,400.
    expect(pose).toEqual({ x: 18 + 475, z: 5290, facing: 90, elevation: 0 })
    expectFlush(pose, SOFA, "W6", SKIRTING_DEPTH)
  })

  it("faces into the room from the right wall (W2)", () => {
    const pose = resolve({ mode: "against", wall: "W2", at: 2400 }, SOFA)
    expect(pose).toEqual({
      x: 2980 - 18 - 475,
      z: 2400,
      facing: 270,
      elevation: 0,
    })
    expectFlush(pose, SOFA, "W2", SKIRTING_DEPTH)
  })

  it("works on the window wall (W5) and the step (W3)", () => {
    const window = resolve({ mode: "against", wall: "W5", at: 1085 }, SIDEBOARD)
    expect(window).toEqual({
      x: 1085,
      z: 7690 - 18 - 225,
      facing: 0,
      elevation: 0,
    })
    expectFlush(window, SIDEBOARD, "W5", SKIRTING_DEPTH)

    const step = resolve({ mode: "against", wall: "W3", at: 405 }, DINING_CHAIR)
    expect(step).toEqual({
      x: 2575,
      z: 7090 - 18 - 260,
      facing: 0,
      elevation: 0,
    })
    expectFlush(step, DINING_CHAIR, "W3", SKIRTING_DEPTH)
  })

  it("anchors the edge nearest the wall's start or end corner at `at`", () => {
    const span = (pose: { z: number }) => [
      7690 - (pose.z + 1100),
      7690 - (pose.z - 1100),
    ]
    const start = resolve(
      { mode: "against", wall: "W6", at: 1000, anchor: "start-edge" },
      SOFA
    )
    expect(span(start)).toEqual([1000, 3200])
    const end = resolve(
      { mode: "against", wall: "W6", at: 3000, anchor: "end-edge" },
      SOFA
    )
    expect(span(end)).toEqual([800, 3000])
  })

  it("centres the item's actual extent, not its origin", () => {
    const pose = resolve({ mode: "against", wall: "W6", at: 2000 }, LOPSIDED)
    // Local x −1,100…900 runs up W6, so the origin sits 100mm past centre.
    expect(pose.z).toBe(7690 - 2100)
    const zs = worldShapes(pose, LOPSIDED).flatMap((s) =>
      s.footprint.map((p) => p[1])
    )
    expect(Math.min(...zs)).toBeCloseTo(7690 - 3000, 6)
    expect(Math.max(...zs)).toBeCloseTo(7690 - 1000, 6)
  })

  it("adds the gap beyond the skirting", () => {
    const pose = resolve(
      { mode: "against", wall: "W6", at: 2400, gap: 50 },
      SOFA
    )
    expect(pose.x).toBe(18 + 50 + 475)
    expectFlush(pose, SOFA, "W6", SKIRTING_DEPTH + 50)
  })

  it("keeps an explicit elevation", () => {
    expect(
      resolve(
        { mode: "against", wall: "W6", at: 2400, elevation: 300 },
        SIDEBOARD
      ).elevation
    ).toBe(300)
  })

  it("turns the item so its left side touches the wall", () => {
    const pose = resolve(
      { mode: "against", wall: "W6", at: 1000, side: "left" },
      SIDEBOARD
    )
    expect(pose).toEqual({ x: 18 + 800, z: 6690, facing: 180, elevation: 0 })
    // Local −x (the item's left, seen from the front) points at W6.
    const t = placementTransform(pose)
    expect(t.toPlan(-1, 0)[0]).toBeLessThan(pose.x)
    expectFlush(pose, SIDEBOARD, "W6", SKIRTING_DEPTH)
  })

  it("turns the item so its right side touches the wall", () => {
    const pose = resolve(
      { mode: "against", wall: "W6", at: 1000, side: "right" },
      SIDEBOARD
    )
    expect(pose).toEqual({ x: 18 + 800, z: 6690, facing: 0, elevation: 0 })
    const t = placementTransform(pose)
    expect(t.toPlan(1, 0)[0]).toBeLessThan(pose.x)
    expectFlush(pose, SIDEBOARD, "W6", SKIRTING_DEPTH)
  })

  it("keeps a lopsided item flush on either side, mirrored or not", () => {
    for (const side of ["left", "right", "back"] as const) {
      for (const mirrored of [false, true]) {
        const pose = resolve(
          { mode: "against", wall: "W6", at: 3000, side },
          LOPSIDED,
          { mirrored }
        )
        expectFlush({ ...pose, mirrored }, LOPSIDED, "W6", SKIRTING_DEPTH)
      }
    }
  })

  it("swaps which face touches when the item is mirrored", () => {
    const plain = resolve(
      { mode: "against", wall: "W6", at: 3000, side: "left" },
      LOPSIDED
    )
    const mirrored = resolve(
      { mode: "against", wall: "W6", at: 3000, side: "left" },
      LOPSIDED,
      { mirrored: true }
    )
    // Unmirrored the 1,100mm half faces the wall; mirrored the 900mm half.
    expect(plain.x).toBe(18 + 1100)
    expect(mirrored.x).toBe(18 + 900)
  })

  it("rejects an unknown wall, listing the walls that exist", () => {
    expectPlacementError(
      () => resolve({ mode: "against", wall: "W9", at: 100 }, SOFA),
      "UNKNOWN_WALL",
      "Wall W9 doesn't exist — this room has walls W1–W6."
    )
  })

  it("rejects `at` beyond the wall's length", () => {
    expectPlacementError(
      () => resolve({ mode: "against", wall: "W1", at: 5000 }, SOFA),
      "AT_OUT_OF_RANGE",
      "at 5,000mm is off the end of W1, which is 2,980mm long. Measure from C1: use a value between 0 and 2,980mm."
    )
  })

  it("refuses wall-mounted items without an elevation", () => {
    expect(() =>
      resolve({ mode: "against", wall: "W2", at: 1000 }, WALL_TV)
    ).toThrow(/wall-mounted/)
  })
})

describe("resolvePosition: onWall", () => {
  it("hangs the back flush on the plaster above the skirting", () => {
    const pose = resolve(
      { mode: "onWall", wall: "W2", at: 3000, elevation: 1200 },
      WALL_TV
    )
    expect(pose).toEqual({
      x: 2980 - 20,
      z: 3000,
      facing: 270,
      elevation: 1200,
    })
    expectFlush(pose, WALL_TV, "W2", 0)
  })

  it("clears the skirting when the bottom is lower than it", () => {
    const low = resolve(
      { mode: "onWall", wall: "W2", at: 3000, elevation: 100 },
      WALL_TV
    )
    expect(low.x).toBe(2980 - 18 - 20)
    const level = resolve(
      { mode: "onWall", wall: "W2", at: 3000, elevation: 150 },
      WALL_TV
    )
    expect(level.x).toBe(2980 - 20)
  })

  it("adds the gap and honours the anchor", () => {
    const pose = resolve(
      {
        mode: "onWall",
        wall: "W2",
        at: 500,
        elevation: 1200,
        gap: 30,
        anchor: "start-edge",
      },
      WALL_TV
    )
    expect(pose).toEqual({
      x: 2980 - 30 - 20,
      z: 500 + 725,
      facing: 270,
      elevation: 1200,
    })
    expectFlush(pose, WALL_TV, "W2", 30)
  })

  it("rejects an unknown wall", () => {
    expect(() =>
      resolve({ mode: "onWall", wall: "W7", at: 0, elevation: 1000 }, WALL_TV)
    ).toThrow("Wall W7 doesn't exist — this room has walls W1–W6.")
  })
})

describe("resolvePosition: centerOn", () => {
  const table: Placement = {
    id: "coffee-table",
    assetId: "table",
    x: 1500,
    z: 3000,
    facing: 90,
    elevation: 0,
  }

  it("centres on another placement and takes its facing", () => {
    expect(
      resolve({ mode: "centerOn", placement: "coffee-table" }, RUG, {
        placements: [table],
      })
    ).toEqual({ x: 1500, z: 3000, facing: 90, elevation: 0 })
  })

  it("applies the world offset and an explicit facing", () => {
    expect(
      resolve(
        {
          mode: "centerOn",
          placement: "coffee-table",
          dx: 100,
          dz: -50,
          facing: 0,
        },
        RUG,
        { placements: [table] }
      )
    ).toEqual({ x: 1600, z: 2950, facing: 0, elevation: 0 })
  })

  it("hangs a pendant from a ceiling fitting", () => {
    expect(resolve({ mode: "centerOn", feature: "L1" }, PENDANT_LAMP)).toEqual({
      x: 1490,
      z: 2400,
      facing: 180,
      elevation: 2450 - 900,
    })
    expect(
      resolve(
        { mode: "centerOn", feature: "L2", elevation: 1000 },
        PENDANT_LAMP
      ).elevation
    ).toBe(1000)
  })

  it("takes a floor feature's facing", () => {
    const room: RoomGeometry = {
      ...ROOM,
      features: [
        {
          type: "hearth",
          id: "H1",
          x: 400,
          z: 3000,
          width: 1200,
          depth: 400,
          height: 50,
          facing: 90,
        },
      ],
    }
    expect(
      resolvePosition(
        { mode: "centerOn", feature: "H1" },
        RUG,
        placementContext(room)
      )
    ).toEqual({ x: 400, z: 3000, facing: 90, elevation: 0 })
  })

  it("rejects wall features with a pointer to against/onWall", () => {
    expectPlacementError(
      () => resolve({ mode: "centerOn", feature: "D1" }, RUG),
      "WALL_FEATURE_TARGET",
      'D1 is a door on wall W1, so there\'s nothing to centre on. Use mode "against" or "onWall" with wall W1 at 1,550mm (its middle) instead.'
    )
  })

  it("lists what exists when the target is unknown", () => {
    expectPlacementError(
      () =>
        resolve({ mode: "centerOn", placement: "sofa-2" }, RUG, {
          placements: [table],
        }),
      "UNKNOWN_PLACEMENT",
      "No placement with id 'sofa-2' to centre on. Existing ids: coffee-table."
    )
    expectPlacementError(
      () => resolve({ mode: "centerOn", feature: "L9" }, PENDANT_LAMP),
      "UNKNOWN_FEATURE",
      "Feature L9 doesn't exist. This room's features are: D1, D2, WIN1, OB1, RAD1, BM1, L1, L2, S1, S2, S3, S4."
    )
  })

  it("needs exactly one target, and not itself", () => {
    expect(() =>
      resolve(
        { mode: "centerOn", placement: "coffee-table", feature: "L1" },
        RUG,
        { placements: [table] }
      )
    ).toThrow(PlacementError)
    expectPlacementError(
      () => resolve({ mode: "centerOn" }, RUG),
      "MISSING_TARGET",
      "centerOn needs a target: give `placement` (a placement id) or `feature` (a floor or ceiling feature id such as L1)."
    )
    expectPlacementError(
      () =>
        resolve({ mode: "centerOn", placement: "coffee-table" }, COFFEE_TABLE, {
          placements: [table],
          self: "coffee-table",
        }),
      "SELF_TARGET",
      "'coffee-table' can't be centred on itself; use nudge to shift it, or centre it on another placement."
    )
  })
})

describe("resolvePosition: inCorner", () => {
  it("backs onto the outgoing wall with a side flush to the incoming one", () => {
    const pose = resolve({ mode: "inCorner", corner: "C1" }, SIDEBOARD)
    expect(pose).toEqual({
      x: 18 + 800,
      z: 18 + 225,
      facing: 180,
      elevation: 0,
    })
    expectFlush(pose, SIDEBOARD, "W1", SKIRTING_DEPTH)
    expectFlush(pose, SIDEBOARD, "W6", SKIRTING_DEPTH)
  })

  it("can back onto the incoming wall instead", () => {
    const pose = resolve(
      { mode: "inCorner", corner: "C1", against: "incoming" },
      SIDEBOARD
    )
    expect(pose).toEqual({ x: 18 + 225, z: 18 + 800, facing: 90, elevation: 0 })
    expectFlush(pose, SIDEBOARD, "W6", SKIRTING_DEPTH)
    expectFlush(pose, SIDEBOARD, "W1", SKIRTING_DEPTH)
  })

  it("applies the gap on both walls", () => {
    const pose = resolve({ mode: "inCorner", corner: "C3", gap: 50 }, SIDEBOARD)
    expect(pose.facing).toBe(0)
    expectFlush(pose, SIDEBOARD, "W3", SKIRTING_DEPTH + 50)
    expectFlush(pose, SIDEBOARD, "W2", SKIRTING_DEPTH + 50)
  })

  it("rejects the reflex corner of the notch", () => {
    expectPlacementError(
      () => resolve({ mode: "inCorner", corner: "C4" }, SIDEBOARD),
      "REFLEX_CORNER",
      'C4 is an inside corner (270°) that points into the room, so nothing can tuck into it. Use mode "against" with W3 or W4 instead.'
    )
  })

  it("rejects an unknown corner", () => {
    expectPlacementError(
      () => resolve({ mode: "inCorner", corner: "C9" }, SIDEBOARD),
      "UNKNOWN_CORNER",
      "Corner C9 doesn't exist — this room has corners C1–C6."
    )
  })

  it("keeps clear of both walls in corners that aren't square", () => {
    // C1 ≈ 80°, C4 ≈ 100°.
    const skewed: RoomGeometry = {
      ...ROOM,
      features: [],
      corners: [
        [0, 0],
        [4000, 0],
        [4000, 2954],
        [521, 2954],
      ],
    }
    const angles = cornerAngles(skewed.corners)
    expect(angles[0]).toBeCloseTo(80, 1)
    expect(angles[3]).toBeCloseTo(100, 1)
    const ctx = placementContext(skewed)
    const cases = [
      { corner: "C1", against: "outgoing", walls: ["W1", "W4"] },
      { corner: "C1", against: "incoming", walls: ["W4", "W1"] },
      { corner: "C4", against: "outgoing", walls: ["W4", "W3"] },
      { corner: "C4", against: "incoming", walls: ["W3", "W4"] },
    ] as const
    for (const { corner, against, walls } of cases) {
      const pose = resolvePosition(
        { mode: "inCorner", corner, against },
        SIDEBOARD,
        ctx
      )
      for (const wall of walls) {
        expect(
          Math.abs(gapToWall(pose, SIDEBOARD, wall, skewed) - SKIRTING_DEPTH)
        ).toBeLessThan(1)
      }
    }
  })
})
