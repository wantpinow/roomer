import { z } from "zod"

import {
  zAerialFeature,
  zCeilingLightFeature,
  zDataFeature,
  zDoorFeature,
  zFloorObstacleFeature,
  zFloorSocketFeature,
  zHearthFeature,
  zOpeningFeature,
  zPendantFeature,
  zRadiatorFeature,
  zSmokeAlarmFeature,
  zSocketFeature,
  zSpotlightFeature,
  zSwitchFeature,
  zWallLightFeature,
  zWallObstacleFeature,
  zWindowFeature,
  type FeatureType,
} from "./features"
import { zFeatureId, zLabel, zPositiveMm } from "./primitives"
import { zFinishes, zSkirting } from "./room"
import { zShellMeasurements } from "./shell"

// Inputs for creating a room and editing its fixed parts. Features are
// stored with ids, but an agent adding one may leave the id out and have a
// readable one assigned (D3, WIN2, …); a replacement never carries an id
// because the op names the feature it replaces.

export const zFeatureInput = z
  .discriminatedUnion("type", [
    zDoorFeature.partial({ id: true }),
    zWindowFeature.partial({ id: true }),
    zOpeningFeature.partial({ id: true }),
    zRadiatorFeature.partial({ id: true }),
    zWallObstacleFeature.partial({ id: true }),
    zSocketFeature.partial({ id: true }),
    zSwitchFeature.partial({ id: true }),
    zDataFeature.partial({ id: true }),
    zAerialFeature.partial({ id: true }),
    zWallLightFeature.partial({ id: true }),
    zHearthFeature.partial({ id: true }),
    zFloorSocketFeature.partial({ id: true }),
    zFloorObstacleFeature.partial({ id: true }),
    zPendantFeature.partial({ id: true }),
    zCeilingLightFeature.partial({ id: true }),
    zSpotlightFeature.partial({ id: true }),
    zSmokeAlarmFeature.partial({ id: true }),
  ])
  .describe(
    "A room feature. Leave out `id` to get a readable one (D1, WIN1, RAD1, …)"
  )

export const zFeatureReplacement = z
  .discriminatedUnion("type", [
    zDoorFeature.omit({ id: true }),
    zWindowFeature.omit({ id: true }),
    zOpeningFeature.omit({ id: true }),
    zRadiatorFeature.omit({ id: true }),
    zWallObstacleFeature.omit({ id: true }),
    zSocketFeature.omit({ id: true }),
    zSwitchFeature.omit({ id: true }),
    zDataFeature.omit({ id: true }),
    zAerialFeature.omit({ id: true }),
    zWallLightFeature.omit({ id: true }),
    zHearthFeature.omit({ id: true }),
    zFloorSocketFeature.omit({ id: true }),
    zFloorObstacleFeature.omit({ id: true }),
    zPendantFeature.omit({ id: true }),
    zCeilingLightFeature.omit({ id: true }),
    zSpotlightFeature.omit({ id: true }),
    zSmokeAlarmFeature.omit({ id: true }),
  ])
  .describe("The feature's complete new definition (every field, minus id)")

export const zAddFeatureOp = z
  .object({
    op: z.literal("addFeature"),
    feature: zFeatureInput,
  })
  .describe("Add a door, window, radiator, socket, light fitting, …")

export const zUpdateFeatureOp = z
  .object({
    op: z.literal("updateFeature"),
    id: zFeatureId.describe("The feature to replace"),
    feature: zFeatureReplacement,
  })
  .describe("Replace a feature's definition, keeping its id")

export const zRemoveFeatureOp = z
  .object({
    op: z.literal("removeFeature"),
    id: zFeatureId,
  })
  .describe("Remove a feature")

export const zSetSkirtingOp = z.object({
  op: z.literal("setSkirting"),
  skirting: zSkirting,
})

export const zSetCeilingHeightOp = z.object({
  op: z.literal("setCeilingHeight"),
  ceilingHeight: zPositiveMm,
})

export const zSetFinishesOp = z
  .object({
    op: z.literal("setFinishes"),
    finishes: zFinishes,
  })
  .describe(
    "Merge into the room's finishes: given fields replace the current ones, an empty string removes one, omitted fields are kept"
  )

export const zRenameRoomOp = z.object({
  op: z.literal("rename"),
  name: zLabel,
})

export const zShellOp = z.discriminatedUnion("op", [
  zAddFeatureOp,
  zUpdateFeatureOp,
  zRemoveFeatureOp,
  zSetSkirtingOp,
  zSetCeilingHeightOp,
  zSetFinishesOp,
  zRenameRoomOp,
])

/** Everything needed to create a room; the outline is solved from `measurements`. */
export const zNewRoom = z.object({
  name: zLabel,
  ceilingHeight: zPositiveMm,
  measurements: zShellMeasurements,
  skirting: zSkirting.optional().describe("Default 150mm high × 18mm deep"),
  features: z.array(zFeatureInput).max(200).optional(),
  finishes: zFinishes.optional(),
})

export type FeatureInput = z.infer<typeof zFeatureInput>
export type FeatureReplacement = z.infer<typeof zFeatureReplacement>
export type AddFeatureOp = z.infer<typeof zAddFeatureOp>
export type UpdateFeatureOp = z.infer<typeof zUpdateFeatureOp>
export type RemoveFeatureOp = z.infer<typeof zRemoveFeatureOp>
export type SetSkirtingOp = z.infer<typeof zSetSkirtingOp>
export type SetCeilingHeightOp = z.infer<typeof zSetCeilingHeightOp>
export type SetFinishesOp = z.infer<typeof zSetFinishesOp>
export type RenameRoomOp = z.infer<typeof zRenameRoomOp>
export type ShellOp = z.infer<typeof zShellOp>
export type NewRoom = z.infer<typeof zNewRoom>

// Both unions must list every feature type: adding one to `zFeature` without
// adding it here fails typecheck.
const _inputCoversEveryType: [
  Exclude<FeatureType, FeatureInput["type"]>,
] extends [never]
  ? true
  : never = true
const _replacementCoversEveryType: [
  Exclude<FeatureType, FeatureReplacement["type"]>,
] extends [never]
  ? true
  : never = true
void _inputCoversEveryType
void _replacementCoversEveryType
