import { directionOf, type Point } from "../geometry/angles"
import { formatDegrees, formatMm } from "../geometry/format"
import { signedArea } from "../geometry/polygon"
import { add, length, roundPoint, scale, sub } from "../geometry/vec"
import { cornerAngles } from "../geometry/walls"
import type {
  PolygonMeasurements,
  RectangleMeasurements,
  ShellMeasurements,
  ShellSolve,
  ShellSolveMethod,
  Vec2,
  WalkMeasurements,
} from "../schema"
import { solveQuad } from "./quad"

// Turns any `ShellMeasurements` form into integer-mm corners, clockwise on
// the plan with C1 at (0, 0) and W1 = C1 → C2, plus a report of how well the
// numbers agreed (see docs/2026-10-11-v1-architecture.md §3.1, spec §4).

export interface ShellSolution {
  corners: Vec2[]
  solve: ShellSolve
}

/** Residual above which the user is told to re-measure (spec §4). */
export const SHELL_RESIDUAL_WARNING_MM = 15
/** How far a walk's turns may stray from ±360° before warning. */
export const WALK_TURN_TOLERANCE_DEG = 2

export function solveShell(measurements: ShellMeasurements): ShellSolution {
  switch (measurements.kind) {
    case "rectangle":
      return solveRectangle(measurements)
    case "walk":
      return solveWalk(measurements)
    case "quad":
      return solveQuadShell(measurements)
    case "polygon":
      return solvePolygon(measurements)
  }
}

function solveRectangle(m: RectangleMeasurements): ShellSolution {
  return finish(
    [
      [0, 0],
      [m.width, 0],
      [m.width, m.depth],
      [0, m.depth],
    ],
    "rectangle",
    0,
    []
  )
}

function solveWalk(m: WalkMeasurements): ShellSolution {
  const warnings: string[] = []
  const points: Point[] = [[0, 0]]
  const cumulative: number[] = [0]
  let bearing = 90 // heading +x (right)
  let total = 0
  let turns = 0

  for (const segment of m.segments) {
    const here = points[points.length - 1]!
    points.push(add(here, scale(directionOf(bearing), segment.length)))
    total += segment.length
    cumulative.push(total)
    const turn = segment.turn ?? 90
    bearing += turn
    turns += turn
  }

  // Compass (Bowditch) rule: shift each corner against the closure error in
  // proportion to the distance walked to reach it.
  const closure = points[points.length - 1]!
  const residual = length(closure)
  let corners = points
    .slice(0, -1)
    .map((p, i) => sub(p, scale(closure, cumulative[i]! / total)))

  if (
    Math.abs(turns - 360) > WALK_TURN_TOLERANCE_DEG &&
    Math.abs(turns + 360) > WALK_TURN_TOLERANCE_DEG
  ) {
    warnings.push(
      `The turns add up to ${formatDegrees(turns)}, but walking once round a room turns 360° in total. Check the turn after each wall (+90 = right, −90 = left; the default is +90).`
    )
  }
  if (residual > SHELL_RESIDUAL_WARNING_MM) {
    warnings.push(
      `The walk ends ${formatMm(residual)} away from C1. The error has been spread across the walls, but anything over ${SHELL_RESIDUAL_WARNING_MM}mm is worth re-measuring.`
    )
  }
  if (signedArea(corners) < 0) {
    corners = [corners[0]!, ...corners.slice(1).reverse()]
    warnings.push(
      "The walk went anticlockwise (turning left at most corners), so the corners have been renumbered clockwise from C1. Wall numbers no longer follow the order you walked them."
    )
  }

  return finish(corners, "walk", residual, warnings)
}

function solveQuadShell(m: Parameters<typeof solveQuad>[0]): ShellSolution {
  const fit = solveQuad(m)
  const warnings = [...fit.warnings]
  if (fit.rmsMm > SHELL_RESIDUAL_WARNING_MM) {
    warnings.push(
      `The measurements disagree by ${formatMm(fit.rmsMm)} on average (RMS); anything over ${SHELL_RESIDUAL_WARNING_MM}mm is worth re-measuring.`
    )
  }
  return finish(fit.corners, fit.method, fit.rmsMm, warnings)
}

function solvePolygon(m: PolygonMeasurements): ShellSolution {
  const warnings: string[] = []
  let corners: Point[] = m.corners.map(([x, z]) => [x, z])
  if (signedArea(corners) < 0) {
    corners = [corners[0]!, ...corners.slice(1).reverse()]
    warnings.push(
      "The corners were listed anticlockwise; they have been renumbered clockwise on the plan, keeping your first corner as C1."
    )
  }
  const origin = corners[0]!
  return finish(
    corners.map((p) => sub(p, origin)),
    "polygon",
    0,
    warnings
  )
}

function finish(
  points: readonly Point[],
  method: ShellSolveMethod,
  residualMm: number,
  warnings: string[]
): ShellSolution {
  const corners: Vec2[] = points.map((p) => roundPoint(p))
  return {
    corners,
    solve: {
      method,
      residualMm: Math.round(residualMm * 10) / 10,
      cornerAngles: safeCornerAngles(corners),
      warnings,
    },
  }
}

/** Interior angles to 0.1°; 0 where two neighbouring corners coincide. */
function safeCornerAngles(corners: readonly Vec2[]): number[] {
  const n = corners.length
  const degenerate = corners.some((c, i) => {
    const next = corners[(i + 1) % n]!
    return c[0] === next[0] && c[1] === next[1]
  })
  if (degenerate) return corners.map(() => 0)
  return cornerAngles(corners).map((a) => Math.round(a * 10) / 10 || 0)
}
