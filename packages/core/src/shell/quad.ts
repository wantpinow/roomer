import { formatDegrees, formatMm } from "../geometry/format"
import { isSimplePolygon, signedArea } from "../geometry/polygon"
import type { Point } from "../geometry/angles"
import { cross, distance, dot, sub } from "../geometry/vec"
import type { QuadMeasurements, ShellSolveMethod } from "../schema"
import { solveLeastSquares } from "./least-squares"

// Four-walled rooms measured with a laser or tape: four sides plus
// diagonals and/or corner triangles. C1 is fixed at the origin and C2 on +x,
// leaving five unknowns (x2, x3, z3, x4, z4) fitted by least squares.

export interface QuadFit {
  corners: Point[]
  method: Extract<ShellSolveMethod, `quad-${string}`>
  /** RMS of the real observations' residuals, mm. */
  rmsMm: number
  warnings: string[]
}

interface Observation {
  /** Residual in mm for the given corners. */
  residual: (corners: readonly Point[]) => number
  /** Pseudo-observations (assumed angles) don't count towards the RMS. */
  assumed?: boolean
}

const cornersFrom = (p: readonly number[]): Point[] => [
  [0, 0],
  [p[0]!, 0],
  [p[1]!, p[2]!],
  [p[3]!, p[4]!],
]

/** Interior angle at corner `i` (radians) of a clockwise-on-plan polygon. */
function interiorAngle(corners: readonly Point[], i: number): number {
  const n = corners.length
  const prev = corners[(i + n - 1) % n]!
  const here = corners[i]!
  const next = corners[(i + 1) % n]!
  const incoming = sub(here, prev)
  const outgoing = sub(next, here)
  return (
    Math.PI - Math.atan2(cross(incoming, outgoing), dot(incoming, outgoing))
  )
}

/**
 * Points at distance r0 from c0 and r1 from c1. When the circles don't meet
 * (inconsistent numbers) both answers collapse onto the line between the
 * centres, which is still a sensible starting guess.
 */
function circleIntersections(
  c0: Point,
  r0: number,
  c1: Point,
  r1: number
): [Point, Point] {
  const delta = sub(c1, c0)
  const d = Math.max(Math.hypot(delta[0], delta[1]), 1e-9)
  const u: Point = d > 1e-9 ? [delta[0] / d, delta[1] / d] : [1, 0]
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a))
  const base: Point = [c0[0] + a * u[0], c0[1] + a * u[1]]
  return [
    [base[0] - h * u[1], base[1] + h * u[0]],
    [base[0] + h * u[1], base[1] - h * u[0]],
  ]
}

/** Which side of line a → b the point is on (> 0: clockwise on the plan). */
const sideOf = (a: Point, b: Point, p: Point): number =>
  cross(sub(b, a), sub(p, a))

/** The intersection on the opposite side of line a → b from `avoid`. */
function farSide(
  options: [Point, Point],
  a: Point,
  b: Point,
  avoid: Point
): Point {
  const avoidSide = Math.sign(sideOf(a, b, avoid))
  const [first, second] = options
  return Math.sign(sideOf(a, b, first)) === avoidSide ? second : first
}

/** Triangle angle opposite c (radians) from the cosine rule, if possible. */
function triangleAngle(a: number, b: number, c: number): number | undefined {
  const cos = (a * a + b * b - c * c) / (2 * a * b)
  if (cos < -1 || cos > 1) return undefined
  return Math.acos(cos)
}

function initialGuess(m: QuadMeasurements, angleAtC1: number): Point[] {
  const [s1, s2, s3, s4] = m.sides
  const c1: Point = [0, 0]
  const c2: Point = [s1, 0]
  const d13 = m.diagonals?.c1c3
  const d24 = m.diagonals?.c2c4

  if (d13 !== undefined) {
    // Triangle C1-C2-C3 below the x axis (z > 0), then C4 across C1-C3.
    const c3 = circleIntersections(c1, d13, c2, s2).find((p) => p[1] > 0) ?? [
      s1,
      s2,
    ]
    const c4 = farSide(circleIntersections(c1, s4, c3, s3), c1, c3, c2)
    return [c1, c2, c3, c4]
  }
  if (d24 !== undefined) {
    const c4 = circleIntersections(c1, s4, c2, d24).find((p) => p[1] > 0) ?? [
      0,
      s4,
    ]
    const c3 = farSide(circleIntersections(c2, s2, c4, s3), c2, c4, c1)
    return [c1, c2, c3, c4]
  }
  const c4: Point = [s4 * Math.cos(angleAtC1), s4 * Math.sin(angleAtC1)]
  const c3 = farSide(circleIntersections(c2, s2, c4, s3), c2, c4, c1)
  return [c1, c2, c3, c4]
}

export function solveQuad(m: QuadMeasurements): QuadFit {
  const warnings: string[] = []
  const sides = m.sides
  const observations: Observation[] = sides.map((length, i) => ({
    residual: (c) => distance(c[i]!, c[(i + 1) % 4]!) - length,
  }))

  const d13 = m.diagonals?.c1c3
  const d24 = m.diagonals?.c2c4
  if (d13 !== undefined) {
    observations.push({ residual: (c) => distance(c[0]!, c[2]!) - d13 })
  }
  if (d24 !== undefined) {
    observations.push({ residual: (c) => distance(c[1]!, c[3]!) - d24 })
  }

  let triangleCount = 0
  let angleAtC1: number | undefined
  for (const t of m.cornerTriangles ?? []) {
    const angle = triangleAngle(t.a, t.b, t.c)
    if (angle === undefined) {
      warnings.push(
        `The corner triangle at C${t.corner} (${formatMm(t.a)}, ${formatMm(t.b)}, ${formatMm(t.c)}) is impossible: the distance between the marks must be shorter than the two marks added together and longer than their difference. It was ignored — re-measure it.`
      )
      continue
    }
    triangleCount++
    const i = t.corner - 1
    if (i === 0) angleAtC1 = angle
    // Angle error → mm: the displacement it causes over the adjacent walls.
    const weight = (sides[(i + 3) % 4]! + sides[i]!) / 2
    observations.push({
      residual: (c) => (interiorAngle(c, i) - angle) * weight,
    })
  }

  let method: QuadFit["method"]
  if (d13 !== undefined || d24 !== undefined) method = "quad-diagonals"
  else if (triangleCount > 0) method = "quad-triangles"
  else {
    method = "quad-assumed-square"
    warnings.push(
      "No diagonals or corner triangles were given, so C1 is assumed to be a right angle (90°). Measure a diagonal (C1 → C3) to check the room is square."
    )
    const weight = (sides[3] + sides[0]) / 2
    observations.push({
      residual: (c) => (interiorAngle(c, 0) - Math.PI / 2) * weight,
      assumed: true,
    })
  }

  const start = initialGuess(m, angleAtC1 ?? Math.PI / 2)
  const p0 = [
    start[1]![0],
    start[2]![0],
    start[2]![1],
    start[3]![0],
    start[3]![1],
  ]
  const fit = solveLeastSquares((p) => {
    const c = cornersFrom(p)
    return observations.map((o) => o.residual(c))
  }, p0)

  let corners = cornersFrom(fit.params)
  if (signedArea(corners) < 0) {
    // Mirror image (same lengths); flip back to clockwise on the plan.
    corners = corners.map(([x, z]) => [x, -z] as Point)
  }

  const real = observations.filter((o) => !o.assumed)
  const rmsMm = Math.sqrt(
    real.reduce((sum, o) => sum + o.residual(corners) ** 2, 0) / real.length
  )

  if (!fit.converged) {
    warnings.push(
      "The solver didn't fully settle; the measurements may be inconsistent. Check the plan against the room."
    )
  }
  if (!isSimplePolygon(corners)) {
    warnings.push(
      "These measurements don't make a simple four-walled room (the walls cross). Check the side lengths and diagonals."
    )
  } else {
    const reflex = corners
      .map((_, i) => interiorAngle(corners, i))
      .findIndex((angle) => angle > Math.PI)
    if (reflex >= 0) {
      warnings.push(
        `C${reflex + 1} comes out as an inside corner (${formatDegrees((interiorAngle(corners, reflex) * 180) / Math.PI)}), which is unusual for a four-walled room. Check the measurements.`
      )
    }
  }

  return { corners, method, rmsMm, warnings }
}
