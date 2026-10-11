import { z } from "zod"

import {
  zDegrees,
  zLabel,
  zMm,
  zNonNegativeMm,
  zPositiveMm,
  zVec3,
} from "./primitives"

// Furniture and other placeable things. Geometry is a list of simple shapes
// ("parts") in item-local millimetres: origin at the centre of the footprint
// on the floor, +z is the item's front, x is width, y is up. The overall
// bounding box must match `dims` (the product's listed W × D × H).
//
// Angles around the vertical follow one convention everywhere (lathe and
// torus arcs, and what a y rotation does): 0° = +z (the front), increasing
// towards +x (the item's right), i.e. a point at angle a sits at
// (sin a, cos a) in (x, z). Rotations are right-handed: a positive angle
// turns counter-clockwise seen from the axis's positive end, so rotation
// [0, 90, 0] turns a part's front (+z) to face +x.

export const zAssetCategory = z.enum([
  "sofa",
  "chair",
  "table",
  "storage",
  "bed",
  "lighting",
  "rug",
  "decor",
  "media",
  "other",
])

export const zMount = z
  .enum(["floor", "floor-covering", "wall", "ceiling"])
  .describe(
    "floor = stands on the floor; floor-covering = rug (never collides with furniture); wall = hangs on a wall; ceiling = hangs from the ceiling"
  )

export const zDims = z
  .object({
    w: zPositiveMm.describe("Width across the front (local x)"),
    d: zPositiveMm.describe("Depth, front to back (local z)"),
    h: zPositiveMm.describe("Height (local y)"),
  })
  .describe("Overall size in mm — the product's listed W × D × H")

export const zTone = z
  .enum(["light", "mid", "dark"])
  .describe(
    "Clay shade for this part (e.g. dark legs, light cushions) — helps the renderer tell materials apart"
  )

/** Most copies one part may expand to, and most parts an asset may expand to. */
export const MAX_REPEAT_COUNT = 64
export const MAX_EXPANDED_PARTS = 400

export const zRepeat = z
  .object({
    count: z
      .number()
      .int()
      .min(2)
      .max(MAX_REPEAT_COUNT)
      .describe("Copies in all, this one included (2–64)"),
    step: zVec3.describe(
      "Offset [dx, dy, dz] in mm from each copy to the next (copy i sits at position + i × step)"
    ),
  })
  .describe(
    "Repeat this part in a row (slats, spindles, rails): copy i (from 0) sits at position + i × step and is named '<name> #<i+1>'. An asset may expand to at most 400 parts."
  )

const partCommon = {
  name: zLabel.describe("What this part is, e.g. 'seat cushion left'"),
  position: zVec3.describe(
    "Centre of the part in item-local mm [x, y, z]; y is height above the floor"
  ),
  rotation: z
    .tuple([zDegrees, zDegrees, zDegrees])
    .optional()
    .describe(
      "Degrees about the item's x, y, z axes, three.js Euler 'XYZ' (the part turns about z first, then y, then x). Right-handed: [0, 90, 0] turns the part's front (+z) to face +x; [90, 0, 0] tips +y towards +z; [0, 0, 90] tips +y towards −x"
    ),
  tone: zTone.optional(),
  repeat: zRepeat.optional(),
}

export const zBoxPart = z.object({
  shape: z.literal("box"),
  ...partCommon,
  size: z
    .tuple([zPositiveMm, zPositiveMm, zPositiveMm])
    .describe("[width (x), height (y), depth (z)] in mm"),
})

export const zRoundedBoxPart = z.object({
  shape: z.literal("roundedBox"),
  ...partCommon,
  size: z
    .tuple([zPositiveMm, zPositiveMm, zPositiveMm])
    .describe("[width (x), height (y), depth (z)] in mm"),
  radius: zPositiveMm.describe(
    "Edge radius; at most half the smallest side (edges 'vertical': half the smaller of width and depth)"
  ),
  edges: z
    .enum(["all", "vertical"])
    .optional()
    .describe(
      "all (default) rounds every edge (a cushion); vertical rounds only the 4 upright edges — a rounded-rectangle slab with flat top and bottom (tabletops, sled legs; radius = depth / 2 makes a stadium)"
    ),
})

export const zCylinderPart = z.object({
  shape: z.literal("cylinder"),
  ...partCommon,
  radiusTop: zNonNegativeMm,
  radiusBottom: zNonNegativeMm,
  height: zPositiveMm.describe("Along local y before rotation"),
})

export const zSpherePart = z.object({
  shape: z.literal("sphere"),
  ...partCommon,
  radius: zPositiveMm,
})

export const zCapsulePart = z.object({
  shape: z.literal("capsule"),
  ...partCommon,
  radius: zPositiveMm,
  length: zNonNegativeMm.describe(
    "Length of the straight middle along local y (before rotation); the total height is length + 2 × radius, centred on position"
  ),
})

export const zTorusPart = z.object({
  shape: z.literal("torus"),
  ...partCommon,
  radius: zPositiveMm.describe(
    "Ring radius: from the centre to the middle of the tube, in the local x–z plane"
  ),
  tube: zPositiveMm.describe(
    "Tube radius (half its thickness); at most radius"
  ),
  arc: z
    .number()
    .gt(0)
    .max(360)
    .optional()
    .describe(
      "Degrees of ring (default 360). Starts at +z (the front) and sweeps towards +x; the open ends are capped flat. Turn it with rotation [0, a, 0] to start at a°"
    ),
})

export const zExtrudePart = z.object({
  shape: z.literal("extrude"),
  ...partCommon,
  axis: z
    .enum(["x", "y", "z"])
    .describe(
      "Extrusion direction. Profile coords [u, v] map to: y → (x, z) plan outline; x → (z, y) side profile; z → (x, y) front profile"
    ),
  profile: z
    .array(z.tuple([zMm, zMm]))
    .min(3)
    .max(256)
    .describe("Closed outline [u, v] in mm, relative to `position`"),
  depth: zPositiveMm.describe(
    "Extrusion length, centred on `position` along the axis"
  ),
  bevel: zPositiveMm
    .optional()
    .describe(
      "Rounds the edges around both end faces by this radius (soft cushions, arms). The outer size stays profile × depth; at most depth / 2, and the profile must stay valid when inset by it"
    ),
})

export const zLathePart = z.object({
  shape: z.literal("lathe"),
  ...partCommon,
  profile: z
    .array(z.tuple([zNonNegativeMm, zMm]))
    .min(2)
    .max(256)
    .describe(
      "Half-profile [radius, y] in mm, relative to `position`, revolved around the local y axis. An open line: start and end at radius 0 for a closed solid, or repeat the first point to revolve a closed outline (a hollow ring)"
    ),
  arc: z
    .tuple([zDegrees, z.number().gt(0).max(360)])
    .optional()
    .describe(
      "[start, length] in degrees for a partial revolve (default the full 360): 0° = +z (the front), increasing towards +x. E.g. [45, 270] is a C open at the front. The cut ends are capped with the profile's outline"
    ),
})

export const zPart = z.discriminatedUnion("shape", [
  zBoxPart,
  zRoundedBoxPart,
  zCylinderPart,
  zSpherePart,
  zCapsulePart,
  zTorusPart,
  zExtrudePart,
  zLathePart,
])

export const zAssetGeometry = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("parts"),
    parts: z.array(zPart).min(1).max(200),
  }),
])

export const zClearance = z
  .object({
    front: zNonNegativeMm.optional(),
    back: zNonNegativeMm.optional(),
    left: zNonNegativeMm.optional(),
    right: zNonNegativeMm.optional(),
  })
  .describe(
    "Space that must stay free beside the item (drawers, doors, legroom, pulling a chair out). Left/right as seen facing the item's front"
  )

export const zClearanceZone = z
  .object({
    name: zLabel.describe("What the space is for, e.g. 'legroom'"),
    rect: z
      .tuple([zMm, zMm, zMm, zMm])
      .describe(
        "[minX, minZ, maxX, maxZ] in item-local mm (+z = front, +x = the item's right); beside the footprint, touching it at most"
      ),
  })
  .describe("A named rectangle of floor that must stay free")

export const zProduct = z.object({
  url: z.url(),
  retailer: z.string().trim().max(80).optional(),
  variant: z.string().trim().max(200).optional(),
  price: z.number().nonnegative().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional()
    .describe("ISO 4217 code, e.g. GBP"),
  dimsSource: z.enum(["listing", "measured", "estimated"]),
})

export const zAssetSpec = z.object({
  name: zLabel,
  category: zAssetCategory,
  mount: zMount,
  dims: zDims,
  geometry: zAssetGeometry,
  clearance: zClearance.optional(),
  clearanceZones: z
    .array(zClearanceZone)
    .min(1)
    .max(8)
    .optional()
    .describe(
      "Exact free-space rectangles; when given they replace `clearance` for lint (W102). Use them when the bounding box's sides are the wrong place, e.g. legroom in front of an L-sofa's seats but not its chaise"
    ),
  description: z
    .string()
    .trim()
    .max(600)
    .optional()
    .describe(
      "Visual description for the photoreal render prompt: materials, colour, silhouette"
    ),
  product: zProduct.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
})

export type AssetCategory = z.infer<typeof zAssetCategory>
export type Mount = z.infer<typeof zMount>
export type Dims = z.infer<typeof zDims>
export type Tone = z.infer<typeof zTone>
export type BoxPart = z.infer<typeof zBoxPart>
export type RoundedBoxPart = z.infer<typeof zRoundedBoxPart>
export type CylinderPart = z.infer<typeof zCylinderPart>
export type SpherePart = z.infer<typeof zSpherePart>
export type CapsulePart = z.infer<typeof zCapsulePart>
export type TorusPart = z.infer<typeof zTorusPart>
export type Repeat = z.infer<typeof zRepeat>
export type ExtrudePart = z.infer<typeof zExtrudePart>
export type LathePart = z.infer<typeof zLathePart>
export type Part = z.infer<typeof zPart>
export type PartShape = Part["shape"]
export type AssetGeometry = z.infer<typeof zAssetGeometry>
export type Clearance = z.infer<typeof zClearance>
export type ClearanceZoneSpec = z.infer<typeof zClearanceZone>
export type Product = z.infer<typeof zProduct>
export type AssetSpec = z.infer<typeof zAssetSpec>

/** Allowed difference between the parts' bounding box and `dims`, per axis. */
export const DIMS_TOLERANCE_MM = 10
