import { z } from "zod"

import { zFinishes } from "./room"
import {
  zBearing,
  zCornerId,
  zDegrees,
  zFeatureId,
  zMm,
  zNonNegativeMm,
  zPlacementId,
  zWallId,
} from "./primitives"

// A layout is one candidate arrangement of a room: a list of placements.
// Placements are always stored resolved (x, z, facing, elevation); the
// relative helpers in `zPlacementPosition` are input-only and are resolved by
// core/placement when a change is applied.

export const zLayoutStatus = z
  .enum(["draft", "candidate", "favourite", "archived"])
  .describe(
    "draft → candidate (worth comparing) → favourite; archived hides it"
  )

export const zPlacement = z.object({
  id: zPlacementId,
  assetId: z.string().min(1).describe("Id of the placed asset"),
  label: z.string().trim().max(80).optional(),
  x: zMm.describe("Footprint centre x in room space"),
  z: zMm.describe("Footprint centre z in room space"),
  facing: zBearing.describe("Bearing the item's front points at"),
  elevation: zNonNegativeMm.describe(
    "Height of the item's bottom above the floor"
  ),
  mirrored: z
    .boolean()
    .optional()
    .describe("Mirror left/right (e.g. flip a chaise to the other side)"),
})

export const zAlongAnchor = z
  .enum(["center", "start-edge", "end-edge"])
  .describe(
    "Which point of the item `at` refers to: its centre, or its edge nearest the wall's start / end corner"
  )

export const zWallSide = z
  .enum(["back", "left", "right"])
  .describe(
    "Which side of the item touches the wall (left/right as seen facing the item's front)"
  )

const zAt = zMm.describe("Distance along the wall from its start corner, in mm")

export const zAtPosition = z
  .object({
    mode: z.literal("at"),
    x: zMm,
    z: zMm,
    facing: zDegrees
      .optional()
      .describe("Bearing; default 180 (front faces down the page)"),
    elevation: zNonNegativeMm.optional(),
  })
  .describe("Absolute position of the footprint centre")

export const zAgainstPosition = z
  .object({
    mode: z.literal("against"),
    wall: zWallId,
    at: zAt,
    anchor: zAlongAnchor.optional().describe("Default center"),
    side: zWallSide.optional().describe("Default back"),
    gap: zNonNegativeMm
      .optional()
      .describe("Extra gap beyond the skirting board; default 0"),
    elevation: zNonNegativeMm.optional(),
  })
  .describe(
    "Stand the item against a wall, clear of the skirting, facing into the room"
  )

export const zOnWallPosition = z
  .object({
    mode: z.literal("onWall"),
    wall: zWallId,
    at: zAt,
    anchor: zAlongAnchor.optional().describe("Default center"),
    elevation: zNonNegativeMm.describe("Height of the item's bottom edge"),
    gap: zNonNegativeMm.optional().describe("Gap off the plaster; default 0"),
  })
  .describe("Mount the item on a wall (TV, shelf, art, mirror)")

export const zCenterOnPosition = z
  .object({
    mode: z.literal("centerOn"),
    placement: zPlacementId
      .optional()
      .describe("Centre on this placement (e.g. rug under a coffee table)"),
    feature: zFeatureId
      .optional()
      .describe(
        "…or on this ceiling/floor feature (e.g. pendant at fitting L1)"
      ),
    dx: zMm.optional().describe("World x offset; default 0"),
    dz: zMm.optional().describe("World z offset; default 0"),
    facing: zDegrees.optional().describe("Default: the target's facing"),
    elevation: zNonNegativeMm.optional(),
  })
  .describe("Centre the item on another placement or a feature")

export const zInCornerPosition = z
  .object({
    mode: z.literal("inCorner"),
    corner: zCornerId,
    against: z
      .enum(["incoming", "outgoing"])
      .optional()
      .describe(
        "Back against the wall arriving at the corner (incoming) or leaving it (outgoing); default outgoing"
      ),
    gap: zNonNegativeMm
      .optional()
      .describe("Gap beyond the skirting on both walls"),
  })
  .describe(
    "Tuck the item into a corner, back to one wall and side to the other"
  )

export const zPlacementPosition = z.discriminatedUnion("mode", [
  zAtPosition,
  zAgainstPosition,
  zOnWallPosition,
  zCenterOnPosition,
  zInCornerPosition,
])

const zAssetRef = z.string().min(1).describe("Asset id or asset key")

export const zAddOp = z.object({
  op: z.literal("add"),
  id: zPlacementId.optional().describe("Default: derived from the asset name"),
  asset: zAssetRef,
  label: z.string().trim().max(80).optional(),
  position: zPlacementPosition,
  mirrored: z.boolean().optional(),
})

export const zMoveOp = z.object({
  op: z.literal("move"),
  id: zPlacementId,
  position: zPlacementPosition,
})

export const zNudgeOp = z.object({
  op: z.literal("nudge"),
  id: zPlacementId,
  dx: zMm.optional().describe("World x shift in mm"),
  dz: zMm.optional().describe("World z shift in mm"),
  dy: zMm
    .optional()
    .describe(
      "Raise (+) or lower (−) by this many mm; the bottom can't go below the floor"
    ),
  rotate: zDegrees
    .optional()
    .describe("Turn clockwise on the plan by this many degrees"),
})

export const zSwapOp = z.object({
  op: z.literal("swap"),
  id: zPlacementId,
  asset: zAssetRef.describe("Replacement asset; keeps centre and facing"),
})

export const zSetOp = z.object({
  op: z.literal("set"),
  id: zPlacementId,
  label: z
    .string()
    .trim()
    .max(80)
    .optional()
    .describe("New label; empty string clears it"),
  mirrored: z.boolean().optional(),
  elevation: zNonNegativeMm
    .optional()
    .describe(
      "Height of the item's bottom above the floor, mm (0 = on the floor)"
    ),
})

export const zRemoveOp = z.object({
  op: z.literal("remove"),
  id: zPlacementId,
})

export const zLayoutOp = z.discriminatedUnion("op", [
  zAddOp,
  zMoveOp,
  zNudgeOp,
  zSwapOp,
  zSetOp,
  zRemoveOp,
])

export const zLayoutSpec = z.object({
  placements: z.array(zPlacement).max(300),
  finishes: zFinishes.optional().describe("Overrides the room's finishes"),
})

export type LayoutStatus = z.infer<typeof zLayoutStatus>
export type Placement = z.infer<typeof zPlacement>
export type AlongAnchor = z.infer<typeof zAlongAnchor>
export type WallSide = z.infer<typeof zWallSide>
export type AtPosition = z.infer<typeof zAtPosition>
export type AgainstPosition = z.infer<typeof zAgainstPosition>
export type OnWallPosition = z.infer<typeof zOnWallPosition>
export type CenterOnPosition = z.infer<typeof zCenterOnPosition>
export type InCornerPosition = z.infer<typeof zInCornerPosition>
export type PlacementPosition = z.infer<typeof zPlacementPosition>
export type AddOp = z.infer<typeof zAddOp>
export type MoveOp = z.infer<typeof zMoveOp>
export type NudgeOp = z.infer<typeof zNudgeOp>
export type SwapOp = z.infer<typeof zSwapOp>
export type SetOp = z.infer<typeof zSetOp>
export type RemoveOp = z.infer<typeof zRemoveOp>
export type LayoutOp = z.infer<typeof zLayoutOp>
export type LayoutSpec = z.infer<typeof zLayoutSpec>

export const DEFAULT_FACING = 180
