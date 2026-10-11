import { z } from "zod"

// Shared building blocks for every Roomer schema. Lengths are always integer
// millimetres and angles are degrees, so agents never deal with metres,
// radians or quaternions (see docs/2026-10-11-v1-architecture.md §3.1).

/** A length in whole millimetres. */
export const zMm = z.number().int().describe("Length in whole millimetres")
export const zPositiveMm = zMm
  .positive()
  .describe("Length in whole millimetres (> 0)")
export const zNonNegativeMm = zMm
  .nonnegative()
  .describe("Length in whole millimetres (>= 0)")

/** Any finite angle in degrees; normalised by whoever consumes it. */
export const zDegrees = z.number().finite().describe("Angle in degrees")

/**
 * A plan bearing, normalised to [0, 360). 0 = up the page (−z), 90 = right
 * (+x), 180 = down the page (+z), 270 = left (−x).
 */
export const zBearing = z
  .number()
  .min(0)
  .lt(360)
  .describe(
    "Plan bearing in degrees, clockwise: 0 = up the page (−z), 90 = right (+x), 180 = down (+z), 270 = left (−x)"
  )

/** A point on the floor plan: (x, z) in room space, millimetres. */
export const zVec2 = z
  .tuple([zMm, zMm])
  .describe("Plan point [x, z] in mm (x right, z down the page)")

/** A point in 3D room space: (x, y, z), millimetres, y up. */
export const zVec3 = z
  .tuple([zMm, zMm, zMm])
  .describe("3D point [x, y, z] in mm (x right, y up, z down the page)")

/** Lowercase kebab-case slug: placement ids, camera ids, asset keys. */
export const zSlug = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, digits and single hyphens (e.g. dining-table-2)"
  )

/** Room feature id, e.g. D1, WIN1, RAD1, or an agent-chosen id. */
export const zFeatureId = z
  .string()
  .regex(
    /^[A-Za-z][A-Za-z0-9-]{0,39}$/,
    "Feature ids start with a letter and use letters, digits and hyphens (e.g. D1, WIN1)"
  )
  .describe("Room feature id, e.g. D1 (door), WIN1 (window), RAD1 (radiator)")

/** Wall id W1..Wn: wall Wi runs from corner Ci to corner Ci+1. */
export const zWallId = z
  .string()
  .regex(/^W[1-9][0-9]*$/, "Wall ids look like W1, W2, …")
  .describe("Wall id: Wi runs from corner Ci to Ci+1 (Wn runs Cn → C1)")

/** Corner id C1..Cn, clockwise around the room as seen on the plan. */
export const zCornerId = z
  .string()
  .regex(/^C[1-9][0-9]*$/, "Corner ids look like C1, C2, …")
  .describe("Corner id, numbered clockwise on the plan starting at C1")

export const zPlacementId = zSlug.describe(
  "Placement id, unique within a layout (e.g. sofa, dining-table, chair-1)"
)
export const zCameraId = zSlug.describe("Camera id (e.g. from-hall-door)")
export const zAssetKey = zSlug.describe(
  "Human-readable unique asset key (e.g. castlery-harper-dining-table-220)"
)

export const zLabel = z.string().trim().min(1).max(80)
export const zNote = z.string().max(2000)

export type Mm = z.infer<typeof zMm>
export type Bearing = z.infer<typeof zBearing>
export type Vec2 = z.infer<typeof zVec2>
export type Vec3 = z.infer<typeof zVec3>
export type FeatureId = z.infer<typeof zFeatureId>
export type WallId = z.infer<typeof zWallId>
export type CornerId = z.infer<typeof zCornerId>
export type PlacementId = z.infer<typeof zPlacementId>
export type CameraId = z.infer<typeof zCameraId>
export type AssetKey = z.infer<typeof zAssetKey>
