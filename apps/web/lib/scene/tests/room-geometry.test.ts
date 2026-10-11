import {
  type Feature,
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_SKIRTING,
} from "@roomer/core"
import {
  area,
  bounds,
  deriveWalls,
  type Point,
  type RoomGeometry,
} from "@roomer/core/geometry"
import { describe, expect, it } from "vitest"

import {
  beamFootprint,
  buildRoomShell,
  CEILING_THICKNESS,
  cutWalls,
  FLOOR_THICKNESS,
  offsetCorner,
  type PrismSolid,
  type ShellSolid,
  shellBounds,
  subtractIntervals,
  WALL_THICKNESS,
  wallPieces,
  wallsFacingAway,
  wallThickness,
  WINDOW_FRAME,
} from "../room-geometry"

const LIVING_ROOM: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
}

const RECTANGLE: RoomGeometry = {
  corners: [
    [0, 0],
    [4000, 0],
    [4000, 3000],
    [0, 3000],
  ],
  ceilingHeight: 2400,
  skirting: { height: 100, depth: 15 },
  features: [],
}

const shell = buildRoomShell(LIVING_ROOM)

function prisms(
  solids: readonly ShellSolid[],
  filter: Partial<Pick<ShellSolid, "role" | "wall" | "feature">>
): PrismSolid[] {
  return solids.filter(
    (s): s is PrismSolid =>
      s.kind === "prism" &&
      Object.entries(filter).every(
        ([key, value]) => s[key as keyof typeof filter] === value
      )
  )
}

const planBounds = (s: PrismSolid) => bounds(s.footprint)
const round = (b: ReturnType<typeof bounds>) => ({
  minX: Math.round(b.minX),
  maxX: Math.round(b.maxX),
  minZ: Math.round(b.minZ),
  maxZ: Math.round(b.maxZ),
})

describe("subtractIntervals", () => {
  it("returns the base when nothing is cut", () => {
    expect(subtractIntervals([0, 10], [])).toEqual([[0, 10]])
  })

  it("removes overlapping and out-of-range cuts", () => {
    expect(
      subtractIntervals(
        [0, 100],
        [
          [20, 40],
          [30, 50],
          [90, 200],
          [-10, 5],
        ]
      )
    ).toEqual([
      [5, 20],
      [50, 90],
    ])
  })

  it("returns nothing when the cuts cover the base", () => {
    expect(subtractIntervals([0, 10], [[-1, 11]])).toEqual([])
  })
})

describe("wallPieces", () => {
  it("is one full piece for a wall without holes", () => {
    expect(wallPieces(3000, 2400, [])).toEqual([
      { u0: 0, u1: 3000, y0: 0, y1: 2400 },
    ])
  })

  it("splits around a window into columns, below and above", () => {
    const pieces = wallPieces(2170, 2450, [
      { feature: "WIN1", u0: 120, u1: 2050, y0: 650, y1: 2100 },
    ])
    expect(pieces).toEqual([
      { u0: 0, u1: 120, y0: 0, y1: 2450 },
      { u0: 120, u1: 2050, y0: 0, y1: 650 },
      { u0: 120, u1: 2050, y0: 2100, y1: 2450 },
      { u0: 2050, u1: 2170, y0: 0, y1: 2450 },
    ])
  })

  it("leaves only a lintel over a floor-to-ceiling-minus-lintel door at a corner", () => {
    expect(
      wallPieces(2000, 2400, [
        { feature: "D", u0: 0, u1: 800, y0: 0, y1: 2000 },
      ])
    ).toEqual([
      { u0: 0, u1: 800, y0: 2000, y1: 2400 },
      { u0: 800, u1: 2000, y0: 0, y1: 2400 },
    ])
  })

  it("merges pieces between neighbouring holes with matching heights", () => {
    const pieces = wallPieces(5000, 2400, [
      { feature: "A", u0: 1000, u1: 2000, y0: 800, y1: 2000 },
      { feature: "B", u0: 2000, u1: 3000, y0: 800, y1: 2000 },
    ])
    expect(pieces).toContainEqual({ u0: 1000, u1: 3000, y0: 0, y1: 800 })
    expect(pieces).toContainEqual({ u0: 1000, u1: 3000, y0: 2000, y1: 2400 })
    expect(pieces).toHaveLength(4)
  })

  it("handles overlapping holes and clips holes to the wall", () => {
    const pieces = wallPieces(2000, 2400, [
      { feature: "A", u0: 500, u1: 1200, y0: 0, y1: 2000 },
      { feature: "B", u0: 1000, u1: 2600, y0: 1000, y1: 2400 },
    ])
    // Nothing solid where both overlap or past the wall's end.
    for (const p of pieces) {
      expect(p.u1).toBeLessThanOrEqual(2000)
      const inA = p.u0 >= 500 && p.u1 <= 1200 && p.y0 < 2000
      const inB = p.u0 >= 1000 && p.y1 > 1000
      expect(inA || inB).toBe(false)
    }
    expect(pieces).toContainEqual({ u0: 1200, u1: 2000, y0: 0, y1: 1000 })
  })
})

describe("offsetCorner", () => {
  const walls = deriveWalls(LIVING_ROOM_CORNERS)

  it("mitres a square corner diagonally", () => {
    // C1 joins W6 (incoming) and W1 (outgoing).
    expect(offsetCorner(walls[5]!, -100, walls[0]!, -100)).toEqual([-100, -100])
    expect(offsetCorner(walls[5]!, 18, walls[0]!, 18)).toEqual([18, 18])
  })

  it("mitres the reflex corner of the window recess outward", () => {
    // C4 joins W3 (incoming, step) and W4 (outgoing, recess side).
    const [x, z] = offsetCorner(walls[2]!, -100, walls[3]!, -100)
    expect(x).toBeCloseTo(2270)
    expect(z).toBeCloseTo(7190)
  })

  it("meets walls of different thickness", () => {
    // C5 joins W4 (100 mm) and W5 (190 mm).
    const [x, z] = offsetCorner(walls[3]!, -100, walls[4]!, -190)
    expect(x).toBeCloseTo(2270)
    expect(z).toBeCloseTo(7880)
  })
})

describe("wallThickness", () => {
  const walls = deriveWalls(LIVING_ROOM_CORNERS)

  it("is the default for walls without windows", () => {
    expect(wallThickness(walls[0]!, LIVING_ROOM_FEATURES)).toBe(WALL_THICKNESS)
  })

  it("deepens a window wall to fit the reveal, frame and outer skin", () => {
    expect(wallThickness(walls[4]!, LIVING_ROOM_FEATURES)).toBe(
      100 + WINDOW_FRAME.depth + WINDOW_FRAME.outerWall
    )
  })
})

describe("buildRoomShell — living room", () => {
  it("puts the window hole in W5 at 650–2100 mm, 1930 mm wide", () => {
    const pieces = prisms(shell.solids, { role: "wall", wall: "W5" })
    expect(pieces).toHaveLength(4)
    const below = pieces.find((p) => p.y0 === 0 && p.y1 === 650)!
    const above = pieces.find((p) => p.y0 === 2100)!
    // W5 runs from C5 (2170, 7690) to C6 (0, 7690): the hole is x 120..2050.
    expect(round(planBounds(below))).toMatchObject({ minX: 120, maxX: 2050 })
    expect(round(planBounds(above))).toMatchObject({ minX: 120, maxX: 2050 })
    expect(above.y1).toBe(LIVING_ROOM_CEILING_HEIGHT)
    // The wall sits outside the room: z from the plaster line outward.
    expect(round(planBounds(below))).toMatchObject({ minZ: 7690, maxZ: 7880 })
  })

  it("leaves door-height holes for D1 and D2 with a lintel above", () => {
    const w1 = prisms(shell.solids, { role: "wall", wall: "W1" })
    const lintel = w1.find((p) => p.y0 === 1980)!
    expect(round(planBounds(lintel))).toMatchObject({ minX: 1150, maxX: 1950 })
    const w2 = prisms(shell.solids, { role: "wall", wall: "W2" })
    const lintel2 = w2.find((p) => p.y0 === 1980)!
    expect(round(planBounds(lintel2))).toMatchObject({ minZ: 5250, maxZ: 6010 })
  })

  it("runs skirting along W1 but skips doorway D1", () => {
    const strips = prisms(shell.solids, { role: "skirting", wall: "W1" })
      .map((s) => round(planBounds(s)))
      .sort((a, b) => a.minX - b.minX)
    expect(strips).toHaveLength(2)
    expect(strips[0]).toMatchObject({ minX: 0, maxX: 1150, minZ: 0, maxZ: 18 })
    expect(strips[1]).toMatchObject({
      minX: 1950,
      maxX: 2980,
      minZ: 0,
      maxZ: 18,
    })
  })

  it("skirting stays below the skirting height", () => {
    for (const s of prisms(shell.solids, { role: "skirting" })) {
      expect(s.y0).toBe(0)
      expect(s.y1).toBe(LIVING_ROOM_SKIRTING.height)
    }
  })

  it("draws pier OB1 protruding 120 mm from W6, full height", () => {
    const [pier] = prisms(shell.solids, { role: "obstacle", feature: "OB1" })
    expect(round(planBounds(pier!))).toEqual({
      minX: 0,
      maxX: 120,
      minZ: 1770,
      maxZ: 2770,
    })
    expect([pier!.y0, pier!.y1]).toEqual([0, LIVING_ROOM_CEILING_HEIGHT])
  })

  it("wraps skirting around the pier and skips the wall behind it", () => {
    const w6 = prisms(shell.solids, { role: "skirting", wall: "W6" })
    const behind = w6.filter((s) => {
      const b = planBounds(s)
      return b.maxX <= 18 + 1e-6 && b.minZ < 2770 - 1 && b.maxZ > 1770 + 1
    })
    expect(behind).toEqual([])
    const wrap = prisms(shell.solids, { role: "skirting", feature: "OB1" })
    expect(wrap).toHaveLength(3)
    const front = wrap
      .map((s) => round(planBounds(s)))
      .find((b) => b.minX === 120)
    expect(front).toEqual({ minX: 120, maxX: 138, minZ: 1752, maxZ: 2788 })
  })

  it("hangs door D2's leaf in W2's opening, set back from the room face", () => {
    const [leaf] = prisms(shell.solids, { role: "door", feature: "D2" })
    const b = planBounds(leaf!)
    // W2 is x = 2980 with the room to the left; the leaf sits in the wall.
    expect(b.minX).toBeCloseTo(2990)
    expect(b.maxX).toBeCloseTo(3030)
    expect(b.minZ).toBeCloseTo(5253)
    expect(b.maxZ).toBeCloseTo(6007)
    expect(leaf!.y1).toBe(1980 - 3)
  })

  it("frames, glazes and sills window WIN1", () => {
    const frame = prisms(shell.solids, {
      role: "window-frame",
      feature: "WIN1",
    })
    // jambs, head, bottom rail and one mullion (1830 mm of glass > 900 mm).
    expect(frame).toHaveLength(6)
    const [glass] = prisms(shell.solids, { role: "glass", feature: "WIN1" })
    expect(round(planBounds(glass!))).toMatchObject({ minX: 170, maxX: 2000 })
    const [sill] = prisms(shell.solids, { role: "sill", feature: "WIN1" })
    const b = round(planBounds(sill!))
    // From the frame face (100 mm reveal) to 50 mm proud of the plaster.
    expect(b).toMatchObject({ minZ: 7640, maxZ: 7790 })
    expect(sill!.y1).toBeGreaterThan(650)
  })

  it("places radiator RAD1 under the window with feed pipes", () => {
    const rad = prisms(shell.solids, { role: "radiator", feature: "RAD1" })
    const all = rad.map(planBounds)
    expect(Math.min(...all.map((b) => b.minX))).toBeGreaterThanOrEqual(385)
    expect(Math.max(...all.map((b) => b.maxX))).toBeLessThanOrEqual(1785)
    expect(Math.min(...all.map((b) => b.minZ))).toBeCloseTo(7690 - 110)
    const pipes = shell.solids.filter((s) => s.role === "pipe")
    expect(pipes).toHaveLength(2)
    expect(pipes.every((p) => p.y0 === 0 && p.y1 === 150)).toBe(true)
  })

  it("draws sockets as thin plates on the wall face", () => {
    const [s1] = prisms(shell.solids, { role: "plate", feature: "S1" })
    expect(round(planBounds(s1!))).toEqual({
      minX: 0,
      maxX: 8,
      minZ: 7690 - 1146,
      maxZ: 7690 - 1000,
    })
    expect([s1!.y0, s1!.y1]).toEqual([300, 386])
  })

  it("hangs a ceiling rose at each pendant fitting, hidden with the ceiling", () => {
    const roses = shell.solids.filter(
      (s) => s.kind === "cylinder" && s.role === "light"
    )
    expect(roses.map((r) => r.feature).sort()).toEqual(["L1", "L2"])
    expect(
      roses.every((r) => r.ceiling && r.y1 === LIVING_ROOM_CEILING_HEIGHT)
    ).toBe(true)
  })

  it("hangs beam BM1 across the room, 250 wide, 230 below the ceiling", () => {
    const [beam] = prisms(shell.solids, { role: "beam", feature: "BM1" })
    expect(round(planBounds(beam!))).toEqual({
      minX: 0,
      maxX: 2980,
      minZ: 2525,
      maxZ: 2775,
    })
    expect([beam!.y0, beam!.y1]).toEqual([2220, LIVING_ROOM_CEILING_HEIGHT])
    // Hidden with the ceiling in the top and orbit views.
    expect(beam!.ceiling).toBe(true)
  })

  it("lays a floor slab and a ceiling slab over the outer outline", () => {
    const [floor] = prisms(shell.solids, { role: "floor" })
    const [ceiling] = prisms(shell.solids, { role: "ceiling" })
    expect(floor!.footprint).toEqual(shell.outline)
    expect([floor!.y0, floor!.y1]).toEqual([-FLOOR_THICKNESS, 0])
    expect(ceiling!.ceiling).toBe(true)
    expect([ceiling!.y0, ceiling!.y1]).toEqual([
      LIVING_ROOM_CEILING_HEIGHT,
      LIVING_ROOM_CEILING_HEIGHT + CEILING_THICKNESS,
    ])
  })

  it("mitres the outer outline around the notch", () => {
    const outline = shell.outline.map(([x, z]) => [
      Math.round(x),
      Math.round(z),
    ])
    expect(outline).toEqual([
      [-100, -100],
      [3080, -100],
      [3080, 7190],
      [2270, 7190],
      [2270, 7880],
      [-100, 7880],
    ])
  })

  it("records the window for the sun", () => {
    expect(shell.windows).toEqual([
      {
        feature: "WIN1",
        wall: "W5",
        center: [1085, 1375, 7690],
        inward: [expect.closeTo(0), -1],
        width: 1930,
        height: 1450,
      },
    ])
  })

  it("bounds the shell including wall thickness and slabs", () => {
    expect(shellBounds(shell)).toEqual({
      minX: -100,
      maxX: 3080,
      minZ: -100,
      maxZ: 7880,
      minY: -FLOOR_THICKNESS,
      maxY: LIVING_ROOM_CEILING_HEIGHT + CEILING_THICKNESS,
    })
  })
})

describe("buildRoomShell — plain rectangle", () => {
  const plain = buildRoomShell(RECTANGLE)

  it("tiles the walls exactly between the room and its outline", () => {
    const walls = prisms(plain.solids, { role: "wall" })
    expect(walls).toHaveLength(4)
    const wallArea = walls.reduce((sum, w) => sum + area(w.footprint), 0)
    expect(wallArea).toBeCloseTo(area(plain.outline) - area(plain.floor))
  })

  it("mitres skirting into every corner", () => {
    const strips = prisms(plain.solids, { role: "skirting" })
    expect(strips).toHaveLength(4)
    const total = strips.reduce((sum, s) => sum + area(s.footprint), 0)
    const inner: Point[] = [
      [15, 15],
      [3985, 15],
      [3985, 2985],
      [15, 2985],
    ]
    expect(total).toBeCloseTo(area(plain.floor) - area(inner))
  })

  it("has no windows, so no sun window", () => {
    expect(plain.windows).toEqual([])
  })

  it("skips features on walls that don't exist", () => {
    const ghost: Feature = {
      type: "socket",
      id: "S9",
      wall: "W9",
      offset: 100,
      width: 86,
      bottom: 300,
      height: 86,
    }
    const built = buildRoomShell({ ...RECTANGLE, features: [ghost] })
    expect(built.solids.some((s) => s.feature === "S9")).toBe(false)
  })

  it("draws floor and ceiling features", () => {
    const built = buildRoomShell({
      ...RECTANGLE,
      features: [
        {
          type: "hearth",
          id: "H1",
          x: 2000,
          z: 400,
          width: 1200,
          depth: 400,
          height: 30,
          facing: 90,
        },
        { type: "ceiling-light", id: "L3", x: 2000, z: 1500 },
        { type: "pendant", id: "L4", x: 1000, z: 1500, drop: 600 },
      ],
    })
    const [hearth] = prisms(built.solids, { role: "hearth" })
    // Facing 90: width runs along z.
    expect(round(planBounds(hearth!))).toEqual({
      minX: 1800,
      maxX: 2200,
      minZ: -200,
      maxZ: 1000,
    })
    const lights = built.solids.filter((s) => s.feature === "L4")
    expect(lights).toHaveLength(3)
    expect(Math.min(...lights.map((l) => l.y0))).toBe(2400 - 600 - 60)
    expect(built.solids.find((s) => s.feature === "L3")?.ceiling).toBe(true)
  })

  it("hangs double doors as two leaves with handles meeting in the middle", () => {
    const built = buildRoomShell({
      ...RECTANGLE,
      features: [
        {
          type: "door",
          id: "D9",
          wall: "W1",
          offset: 1000,
          width: 1200,
          bottom: 0,
          height: 2000,
          hinge: "start",
          swing: "in",
          leaves: 2,
        },
      ],
    })
    const leaves = prisms(built.solids, { role: "door" })
    expect(leaves).toHaveLength(2)
    const handles = prisms(built.solids, { role: "handle" }).map(planBounds)
    expect(handles).toHaveLength(4)
    for (const h of handles) {
      expect(Math.abs((h.minX + h.maxX) / 2 - 1600)).toBeLessThan(200)
      // Handles stand proud of the room face.
      expect(h.maxZ).toBeGreaterThan(0)
    }
  })
})

describe("beamFootprint", () => {
  it("is a rectangle around a diagonal centreline", () => {
    const footprint = beamFootprint({
      start: [0, 0],
      end: [3000, 4000],
      width: 200,
    })
    // Unit direction (0.6, 0.8), so the half-width offset is (−80, 60).
    const expected = [
      [-80, 60],
      [2920, 4060],
      [3080, 3940],
      [80, -60],
    ]
    footprint.forEach(([x, z], i) => {
      expect(x).toBeCloseTo(expected[i]![0]!)
      expect(z).toBeCloseTo(expected[i]![1]!)
    })
  })
})

describe("wallsFacingAway", () => {
  const walls = deriveWalls(LIVING_ROOM_CORNERS)

  it("names the walls between an outside viewpoint and the room", () => {
    // Bottom-left of the plan, outside the room.
    expect(wallsFacingAway(walls, [-5000, 12000])).toEqual(["W3", "W5", "W6"])
  })

  it("names none from inside the room", () => {
    expect(wallsFacingAway(walls, [1500, 3000])).toEqual([])
  })
})

describe("cutWalls", () => {
  it("cuts solids on the named walls and leaves the rest", () => {
    const cut = cutWalls(shell.solids, ["W5"], 800)
    const onW5 = cut.filter((s) => s.wall === "W5")
    expect(onW5.every((s) => s.y1 <= 800)).toBe(true)
    // The window (from 650) survives as a stub; anything starting higher goes.
    expect(onW5.some((s) => s.feature === "WIN1")).toBe(true)
    expect(onW5.some((s) => s.role === "wall" && s.y0 >= 800)).toBe(false)
    const others = cut.filter((s) => s.wall !== "W5")
    expect(others).toEqual(shell.solids.filter((s) => s.wall !== "W5"))
  })
})
