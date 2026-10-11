import { z } from "zod"

import { zDegrees, zPositiveMm, zVec2 } from "./primitives"

// How a room's outline is measured and the solved result. Any of the four
// measurement forms can be stored; `solveShell` (core/shell) turns them into
// corners and reports how self-consistent the numbers were.

export const zRectangleMeasurements = z
  .object({
    kind: z.literal("rectangle"),
    width: zPositiveMm.describe("Length of W1 (C1 → C2), left to right"),
    depth: zPositiveMm.describe("Length of W2 (C2 → C3), top to bottom"),
  })
  .describe("A plain rectangle: two lengths")

export const zCornerTriangle = z
  .object({
    corner: z.number().int().min(1).max(4).describe("Corner number (1–4)"),
    a: zPositiveMm.describe(
      "Distance marked along the incoming wall (towards the previous corner)"
    ),
    b: zPositiveMm.describe(
      "Distance marked along the outgoing wall (towards the next corner)"
    ),
    c: zPositiveMm.describe("Distance measured between the two marks"),
  })
  .describe(
    "Tape-only corner angle: mark a along one wall and b along the other, measure c between the marks (600/800/1000 = square)"
  )

export const zQuadMeasurements = z
  .object({
    kind: z.literal("quad"),
    sides: z
      .tuple([zPositiveMm, zPositiveMm, zPositiveMm, zPositiveMm])
      .describe("Wall lengths [C1→C2, C2→C3, C3→C4, C4→C1]"),
    diagonals: z
      .object({
        c1c3: zPositiveMm.optional().describe("Diagonal C1 → C3"),
        c2c4: zPositiveMm.optional().describe("Diagonal C2 → C4"),
      })
      .optional(),
    cornerTriangles: z.array(zCornerTriangle).max(4).optional(),
  })
  .describe(
    "Four walls plus diagonals and/or corner triangles; the solver fits the shape and reports corner angles"
  )

export const zWalkSegment = z.object({
  length: zPositiveMm.describe("Wall length"),
  turn: zDegrees
    .optional()
    .describe(
      "Turn after this wall: +90 = turn right (clockwise on the plan, the default), −90 = turn left"
    ),
})

export const zWalkMeasurements = z
  .object({
    kind: z.literal("walk"),
    segments: z.array(zWalkSegment).min(3).max(64),
  })
  .describe(
    "Walk the walls clockwise from C1 heading right (+x): each wall length, then the turn. Closure error is spread across the walls"
  )

export const zPolygonMeasurements = z
  .object({
    kind: z.literal("polygon"),
    corners: z.array(zVec2).min(3).max(64),
  })
  .describe("Escape hatch: explicit corner coordinates")

export const zShellMeasurements = z.discriminatedUnion("kind", [
  zRectangleMeasurements,
  zQuadMeasurements,
  zWalkMeasurements,
  zPolygonMeasurements,
])

export const zShellSolveMethod = z.enum([
  "rectangle",
  "quad-diagonals",
  "quad-triangles",
  "quad-assumed-square",
  "walk",
  "polygon",
])

export const zShellSolve = z.object({
  method: zShellSolveMethod,
  residualMm: z
    .number()
    .nonnegative()
    .describe(
      "How far the redundant measurements disagree; re-measure if > 15mm"
    ),
  cornerAngles: z
    .array(z.number())
    .describe("Interior angle at each corner C1..Cn, degrees"),
  warnings: z.array(z.string()),
})

export const zShell = z.object({
  measurements: zShellMeasurements,
  corners: z
    .array(zVec2)
    .min(3)
    .describe("Solved corners C1..Cn, clockwise on the plan, C1 at (0, 0)"),
  solve: zShellSolve,
})

export type RectangleMeasurements = z.infer<typeof zRectangleMeasurements>
export type QuadMeasurements = z.infer<typeof zQuadMeasurements>
export type CornerTriangle = z.infer<typeof zCornerTriangle>
export type WalkMeasurements = z.infer<typeof zWalkMeasurements>
export type WalkSegment = z.infer<typeof zWalkSegment>
export type PolygonMeasurements = z.infer<typeof zPolygonMeasurements>
export type ShellMeasurements = z.infer<typeof zShellMeasurements>
export type ShellSolveMethod = z.infer<typeof zShellSolveMethod>
export type ShellSolve = z.infer<typeof zShellSolve>
export type Shell = z.infer<typeof zShell>
