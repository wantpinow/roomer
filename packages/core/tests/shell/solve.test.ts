import { describe, expect, it } from "vitest"

import {
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_MEASUREMENTS,
} from "../../src/fixtures"
import { distance, signedArea, type Point } from "../../src/geometry"
import type { QuadMeasurements, Vec2 } from "../../src/schema"
import { solveShell } from "../../src/shell"
import { solveLeastSquares, solveLinear } from "../../src/shell/least-squares"

const expectCornersNear = (
  actual: readonly Vec2[],
  expected: readonly Point[],
  toleranceMm: number
) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((corner, i) => {
    expect(distance(corner, expected[i]!)).toBeLessThanOrEqual(toleranceMm)
  })
}

describe("solveShell: rectangle", () => {
  it("lays out W1 along +x and W2 down the page", () => {
    const { corners, solve } = solveShell({
      kind: "rectangle",
      width: 3000,
      depth: 4000,
    })
    expect(corners).toEqual([
      [0, 0],
      [3000, 0],
      [3000, 4000],
      [0, 4000],
    ])
    expect(solve).toEqual({
      method: "rectangle",
      residualMm: 0,
      cornerAngles: [90, 90, 90, 90],
      warnings: [],
    })
  })
})

describe("solveShell: walk", () => {
  it("solves the living room exactly", () => {
    const { corners, solve } = solveShell(LIVING_ROOM_MEASUREMENTS)
    expect(corners).toEqual(LIVING_ROOM_CORNERS)
    expect(solve.method).toBe("walk")
    expect(solve.residualMm).toBe(0)
    expect(solve.cornerAngles).toEqual([90, 90, 90, 270, 90, 90])
    expect(solve.warnings).toEqual([])
  })

  it("turns right (+90) after each wall by default", () => {
    const { corners } = solveShell({
      kind: "walk",
      segments: [
        { length: 3000 },
        { length: 4000 },
        { length: 3000 },
        { length: 4000 },
      ],
    })
    expect(corners).toEqual([
      [0, 0],
      [3000, 0],
      [3000, 4000],
      [0, 4000],
    ])
  })

  it("spreads a small closure error along the walk (compass rule)", () => {
    // The last wall is 12mm too long, so the walk ends at (0, −12).
    const { corners, solve } = solveShell({
      kind: "walk",
      segments: [
        { length: 3000 },
        { length: 4000 },
        { length: 3000 },
        { length: 4012 },
      ],
    })
    // Correction at each corner = 12mm × distance walked / 14,012mm.
    expect(corners).toEqual([
      [0, 0],
      [3000, Math.round((12 * 3000) / 14012)],
      [3000, 4000 + Math.round((12 * 7000) / 14012)],
      [0, 4000 + Math.round((12 * 10000) / 14012)],
    ])
    expect(solve.residualMm).toBe(12)
    expect(solve.warnings).toEqual([])
  })

  it("warns when the walk misses C1 by more than 15mm", () => {
    const { solve } = solveShell({
      kind: "walk",
      segments: [
        { length: 3000 },
        { length: 4000 },
        { length: 3000 },
        { length: 4030 },
      ],
    })
    expect(solve.residualMm).toBe(30)
    expect(solve.warnings).toHaveLength(1)
    expect(solve.warnings[0]).toContain("ends 30mm away from C1")
  })

  it("renumbers an anticlockwise walk clockwise, keeping C1", () => {
    const { corners, solve } = solveShell({
      kind: "walk",
      segments: [
        { length: 3000, turn: -90 },
        { length: 4000, turn: -90 },
        { length: 3000, turn: -90 },
        { length: 4000, turn: -90 },
      ],
    })
    expect(corners).toEqual([
      [0, 0],
      [0, -4000],
      [3000, -4000],
      [3000, 0],
    ])
    expect(signedArea(corners)).toBeGreaterThan(0)
    expect(solve.cornerAngles).toEqual([90, 90, 90, 90])
    expect(solve.warnings).toHaveLength(1)
    expect(solve.warnings[0]).toContain("anticlockwise")
  })

  it("warns when the turns don't add up to a full circle", () => {
    const { solve } = solveShell({
      kind: "walk",
      segments: [
        { length: 3000, turn: 90 },
        { length: 4000, turn: 90 },
        { length: 3000, turn: 80 },
        { length: 4000, turn: 90 },
      ],
    })
    expect(solve.warnings.some((w) => w.includes("add up to 350°"))).toBe(true)
  })

  it("accepts non-square turns within tolerance", () => {
    // A parallelogram: 60° and 120° corners.
    const { corners, solve } = solveShell({
      kind: "walk",
      segments: [
        { length: 2000, turn: 120 },
        { length: 1000, turn: 60 },
        { length: 2000, turn: 120 },
        { length: 1000, turn: 60 },
      ],
    })
    expect(corners[2]).toEqual([2000 - 500, 866])
    expect(solve.cornerAngles).toEqual([120, 60, 120, 60])
    expect(solve.residualMm).toBe(0)
    expect(solve.warnings).toEqual([])
  })
})

describe("solveShell: polygon", () => {
  it("translates so C1 is at the origin", () => {
    const { corners, solve } = solveShell({
      kind: "polygon",
      corners: [
        [100, 200],
        [1100, 200],
        [1100, 700],
        [100, 700],
      ],
    })
    expect(corners).toEqual([
      [0, 0],
      [1000, 0],
      [1000, 500],
      [0, 500],
    ])
    expect(solve).toEqual({
      method: "polygon",
      residualMm: 0,
      cornerAngles: [90, 90, 90, 90],
      warnings: [],
    })
  })

  it("reorders anticlockwise corners clockwise, keeping the first as C1", () => {
    const { corners, solve } = solveShell({
      kind: "polygon",
      corners: [
        [100, 100],
        [100, 600],
        [1100, 600],
        [1100, 100],
      ],
    })
    expect(corners).toEqual([
      [0, 0],
      [1000, 0],
      [1000, 500],
      [0, 500],
    ])
    expect(solve.warnings[0]).toContain("anticlockwise")
  })
})

// A slightly out-of-square room with known corners (clockwise on the plan,
// C2 on +x), used to generate exact measurements.
const KNOWN: Point[] = [
  [0, 0],
  [3000, 0],
  [3040, 4010],
  [-25, 3995],
]

const side = (i: number) => Math.round(distance(KNOWN[i]!, KNOWN[(i + 1) % 4]!))
const KNOWN_SIDES: QuadMeasurements["sides"] = [
  side(0),
  side(1),
  side(2),
  side(3),
]
const KNOWN_C1C3 = Math.round(distance(KNOWN[0]!, KNOWN[2]!))
const KNOWN_C2C4 = Math.round(distance(KNOWN[1]!, KNOWN[3]!))

/** Tape triangle at a corner of KNOWN: marks a/b along the two walls. */
function knownTriangle(corner: 1 | 2 | 3 | 4, a = 600, b = 800) {
  const i = corner - 1
  const here = KNOWN[i]!
  const prev = KNOWN[(i + 3) % 4]!
  const next = KNOWN[(i + 1) % 4]!
  const toward = (p: Point, d: number): Point => {
    const len = distance(here, p)
    return [
      here[0] + ((p[0] - here[0]) * d) / len,
      here[1] + ((p[1] - here[1]) * d) / len,
    ]
  }
  return {
    corner,
    a,
    b,
    c: Math.round(distance(toward(prev, a), toward(next, b))),
  }
}

describe("solveShell: quad", () => {
  it("recovers a known room from four sides and both diagonals", () => {
    const { corners, solve } = solveShell({
      kind: "quad",
      sides: KNOWN_SIDES,
      diagonals: { c1c3: KNOWN_C1C3, c2c4: KNOWN_C2C4 },
    })
    expect(solve.method).toBe("quad-diagonals")
    expect(corners[0]).toEqual([0, 0])
    expect(corners[1]![1]).toBe(0)
    expectCornersNear(corners, KNOWN, 2)
    expect(solve.residualMm).toBeLessThan(1)
    expect(solve.warnings).toEqual([])
  })

  it("is exactly determined by four sides and one diagonal", () => {
    for (const diagonals of [{ c1c3: KNOWN_C1C3 }, { c2c4: KNOWN_C2C4 }]) {
      const { corners, solve } = solveShell({
        kind: "quad",
        sides: KNOWN_SIDES,
        diagonals,
      })
      expect(solve.method).toBe("quad-diagonals")
      expectCornersNear(corners, KNOWN, 2)
      expect(solve.residualMm).toBe(0)
    }
  })

  it("spreads a few mm of measuring error and reports it", () => {
    const { corners, solve } = solveShell({
      kind: "quad",
      sides: [
        KNOWN_SIDES[0] + 2,
        KNOWN_SIDES[1],
        KNOWN_SIDES[2],
        KNOWN_SIDES[3] - 3,
      ],
      diagonals: { c1c3: KNOWN_C1C3 + 4, c2c4: KNOWN_C2C4 },
    })
    expectCornersNear(corners, KNOWN, 5)
    expect(solve.residualMm).toBeGreaterThan(0.5)
    expect(solve.residualMm).toBeLessThan(5)
    expect(solve.warnings).toEqual([])
  })

  it("handles an out-of-square old room", () => {
    const sides: QuadMeasurements["sides"] = [3000, 4012, 2990, 4000]
    const { corners, solve } = solveShell({
      kind: "quad",
      sides,
      diagonals: { c1c3: 5003, c2c4: 4996 },
    })
    expect(solve.method).toBe("quad-diagonals")
    expect(signedArea(corners)).toBeGreaterThan(0)
    corners.forEach((corner, i) => {
      const next = corners[(i + 1) % 4]!
      expect(Math.abs(distance(corner, next) - sides[i]!)).toBeLessThan(6)
    })
    expect(Math.abs(distance(corners[0]!, corners[2]!) - 5003)).toBeLessThan(6)
    expect(Math.abs(distance(corners[1]!, corners[3]!) - 4996)).toBeLessThan(6)
    for (const angle of solve.cornerAngles) {
      expect(Math.abs(angle - 90)).toBeLessThan(1)
    }
    expect(solve.cornerAngles.reduce((a, b) => a + b, 0)).toBeCloseTo(360, 0)
    expect(solve.residualMm).toBeGreaterThan(0)
    expect(solve.residualMm).toBeLessThan(5)
  })

  it("warns when the measurements disagree by more than 15mm", () => {
    const { solve } = solveShell({
      kind: "quad",
      sides: [3000, 4000, 3000, 4000],
      diagonals: { c1c3: 5000, c2c4: 5200 },
    })
    expect(solve.residualMm).toBeGreaterThan(15)
    expect(solve.warnings.some((w) => w.includes("worth re-measuring"))).toBe(
      true
    )
  })

  it("fits corner triangles when there are no diagonals", () => {
    const { corners, solve } = solveShell({
      kind: "quad",
      sides: KNOWN_SIDES,
      cornerTriangles: [
        knownTriangle(1),
        knownTriangle(2),
        knownTriangle(3),
        knownTriangle(4),
      ],
    })
    expect(solve.method).toBe("quad-triangles")
    expectCornersNear(corners, KNOWN, 6)
    expect(solve.residualMm).toBeLessThan(5)
  })

  it("uses a single triangle at any corner", () => {
    const { corners, solve } = solveShell({
      kind: "quad",
      sides: KNOWN_SIDES,
      cornerTriangles: [knownTriangle(3)],
    })
    expect(solve.method).toBe("quad-triangles")
    expectCornersNear(corners, KNOWN, 6)
  })

  it("assumes a square C1 when given only sides, and says so", () => {
    const { corners, solve } = solveShell({
      kind: "quad",
      sides: [3000, 4000, 3000, 4000],
    })
    expect(solve.method).toBe("quad-assumed-square")
    expect(corners).toEqual([
      [0, 0],
      [3000, 0],
      [3000, 4000],
      [0, 4000],
    ])
    expect(solve.cornerAngles[0]).toBe(90)
    expect(solve.residualMm).toBe(0)
    expect(solve.warnings).toHaveLength(1)
    expect(solve.warnings[0]).toContain("assumed to be a right angle")
  })

  it("ignores an impossible corner triangle with a warning", () => {
    const { solve } = solveShell({
      kind: "quad",
      sides: [3000, 4000, 3000, 4000],
      cornerTriangles: [{ corner: 2, a: 600, b: 800, c: 1500 }],
    })
    expect(solve.method).toBe("quad-assumed-square")
    expect(solve.warnings[0]).toContain("corner triangle at C2")
    expect(solve.warnings[0]).toContain("impossible")
  })

  it("warns when the sides can't close into a four-walled room", () => {
    const { solve } = solveShell({
      kind: "quad",
      sides: [1000, 1000, 1000, 5000],
      diagonals: { c1c3: 1500 },
    })
    expect(solve.warnings.length).toBeGreaterThan(0)
  })
})

describe("least squares helpers", () => {
  it("solves small linear systems and rejects singular ones", () => {
    const x = solveLinear(
      [
        [2, 1],
        [1, 3],
      ],
      [3, 5]
    )
    expect(x?.[0]).toBeCloseTo(0.8, 12)
    expect(x?.[1]).toBeCloseTo(1.4, 12)
    expect(
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2]
      )
    ).toBeUndefined()
  })

  it("minimises a non-linear residual", () => {
    // Point at distance 5 from (0, 0) and 5 from (6, 0), starting above.
    const result = solveLeastSquares(
      ([x = 0, z = 0]) => [Math.hypot(x, z) - 5, Math.hypot(x - 6, z) - 5],
      [1, 1]
    )
    expect(result.converged).toBe(true)
    expect(result.params[0]).toBeCloseTo(3, 6)
    expect(result.params[1]).toBeCloseTo(4, 6)
  })
})
