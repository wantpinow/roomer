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

const partCommon = {
  name: zLabel.describe("What this part is, e.g. 'seat cushion left'"),
  position: zVec3.describe(
    "Centre of the part in item-local mm [x, y, z]; y is height above the floor"
  ),
  rotation: z
    .tuple([zDegrees, zDegrees, zDegrees])
    .optional()
    .describe(
      "Rotation about local x, y, z in degrees, applied in X → Y → Z order"
    ),
  tone: zTone.optional(),
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
  radius: zPositiveMm.describe("Edge radius; at most half the smallest side"),
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
})

export const zLathePart = z.object({
  shape: z.literal("lathe"),
  ...partCommon,
  profile: z
    .array(z.tuple([zNonNegativeMm, zMm]))
    .min(2)
    .max(256)
    .describe(
      "Half-profile [radius, y] in mm, relative to `position`, revolved around the local y axis"
    ),
})

export const zPart = z.discriminatedUnion("shape", [
  zBoxPart,
  zRoundedBoxPart,
  zCylinderPart,
  zSpherePart,
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
export type ExtrudePart = z.infer<typeof zExtrudePart>
export type LathePart = z.infer<typeof zLathePart>
export type Part = z.infer<typeof zPart>
export type PartShape = Part["shape"]
export type AssetGeometry = z.infer<typeof zAssetGeometry>
export type Clearance = z.infer<typeof zClearance>
export type Product = z.infer<typeof zProduct>
export type AssetSpec = z.infer<typeof zAssetSpec>

/** Allowed difference between the parts' bounding box and `dims`, per axis. */
export const DIMS_TOLERANCE_MM = 10
