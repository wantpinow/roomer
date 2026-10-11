import { z } from "zod"

import {
  zBearing,
  zFeatureId,
  zMm,
  zNonNegativeMm,
  zPositiveMm,
  zVec2,
  zWallId,
} from "./primitives"

// The fixed parts of a room: doors, windows, radiators, sockets, structural
// obstacles and light fittings. They are attached to a wall (positioned along
// it), stand on the floor, or hang from the ceiling.

const featureCommon = {
  id: zFeatureId,
  label: z.string().trim().max(80).optional(),
  assumed: z
    .boolean()
    .optional()
    .describe("True when estimated rather than measured, so it can be checked"),
}

const wallAttached = {
  ...featureCommon,
  wall: zWallId,
  offset: zNonNegativeMm.describe(
    "Distance along the wall from its start corner to the feature's nearest edge"
  ),
  width: zPositiveMm.describe("Extent along the wall"),
  bottom: zNonNegativeMm.describe("Height of the bottom edge above the floor"),
  height: zPositiveMm.describe("Vertical extent"),
}

export const zDoorFeature = z.object({
  type: z.literal("door"),
  ...wallAttached,
  hinge: z
    .enum(["start", "end"])
    .describe(
      "Which jamb the hinges are on: the one nearer the wall's start corner, or its end corner"
    ),
  swing: z
    .enum(["in", "out", "none"])
    .describe("in = opens into this room (needs a clear swing arc)"),
  leaves: z
    .union([z.literal(1), z.literal(2)])
    .optional()
    .describe("2 for double doors (each leaf is width/2); default 1"),
})

export const zWindowFeature = z.object({
  type: z.literal("window"),
  ...wallAttached,
  opens: z.enum(["in", "out", "sash", "fixed"]),
  revealDepth: zNonNegativeMm
    .optional()
    .describe("Depth of the window recess into the wall"),
  sillDepth: zNonNegativeMm
    .optional()
    .describe("How far the internal sill sticks out into the room"),
})

export const zOpeningFeature = z.object({
  type: z.literal("opening"),
  ...wallAttached,
})

export const zRadiatorFeature = z.object({
  type: z.literal("radiator"),
  ...wallAttached,
  depth: zPositiveMm.describe("How far it sticks out from the wall"),
})

export const zWallObstacleFeature = z.object({
  type: z.literal("obstacle"),
  ...wallAttached,
  depth: zPositiveMm.describe("How far it sticks out from the wall"),
  kind: z.enum(["chimney-breast", "pier", "pillar", "boxing", "other"]),
})

const gang = z
  .union([z.literal(1), z.literal(2)])
  .optional()
  .describe("Single or double")

export const zSocketFeature = z.object({
  type: z.literal("socket"),
  ...wallAttached,
  gang,
})
export const zSwitchFeature = z.object({
  type: z.literal("switch"),
  ...wallAttached,
  gang,
})
export const zDataFeature = z.object({
  type: z.literal("data"),
  ...wallAttached,
})
export const zAerialFeature = z.object({
  type: z.literal("aerial"),
  ...wallAttached,
})
export const zWallLightFeature = z.object({
  type: z.literal("wall-light"),
  ...wallAttached,
})

const floorStanding = {
  ...featureCommon,
  x: zMm.describe("Centre x in room space"),
  z: zMm.describe("Centre z in room space"),
  width: zPositiveMm,
  depth: zPositiveMm,
  height: zPositiveMm,
  facing: zBearing.optional(),
}

export const zHearthFeature = z.object({
  type: z.literal("hearth"),
  ...floorStanding,
})
export const zFloorSocketFeature = z.object({
  type: z.literal("floor-socket"),
  ...floorStanding,
})
export const zFloorObstacleFeature = z.object({
  type: z.literal("floor-obstacle"),
  ...floorStanding,
})

const ceilingMounted = {
  ...featureCommon,
  x: zMm.describe("x in room space"),
  z: zMm.describe("z in room space"),
}

export const zPendantFeature = z.object({
  type: z.literal("pendant"),
  ...ceilingMounted,
  drop: zNonNegativeMm
    .optional()
    .describe("Flex/cable drop below the ceiling, if a lamp is already fitted"),
})
export const zCeilingLightFeature = z.object({
  type: z.literal("ceiling-light"),
  ...ceilingMounted,
})
export const zSpotlightFeature = z.object({
  type: z.literal("spotlight"),
  ...ceilingMounted,
})
export const zSmokeAlarmFeature = z.object({
  type: z.literal("smoke-alarm"),
  ...ceilingMounted,
})

export const zBeamFeature = z.object({
  type: z.literal("beam"),
  ...featureCommon,
  start: zVec2.describe(
    "One end of the beam's centreline on the plan (usually on a wall)"
  ),
  end: zVec2.describe("The other end of the beam's centreline"),
  width: zPositiveMm.describe("Beam width on the plan"),
  drop: zPositiveMm.describe("How far the beam hangs below the ceiling"),
})

export const zFeature = z.discriminatedUnion("type", [
  zDoorFeature,
  zWindowFeature,
  zOpeningFeature,
  zRadiatorFeature,
  zWallObstacleFeature,
  zSocketFeature,
  zSwitchFeature,
  zDataFeature,
  zAerialFeature,
  zWallLightFeature,
  zHearthFeature,
  zFloorSocketFeature,
  zFloorObstacleFeature,
  zPendantFeature,
  zCeilingLightFeature,
  zSpotlightFeature,
  zSmokeAlarmFeature,
  zBeamFeature,
])

export type DoorFeature = z.infer<typeof zDoorFeature>
export type WindowFeature = z.infer<typeof zWindowFeature>
export type OpeningFeature = z.infer<typeof zOpeningFeature>
export type RadiatorFeature = z.infer<typeof zRadiatorFeature>
export type WallObstacleFeature = z.infer<typeof zWallObstacleFeature>
export type SocketFeature = z.infer<typeof zSocketFeature>
export type HearthFeature = z.infer<typeof zHearthFeature>
export type PendantFeature = z.infer<typeof zPendantFeature>
export type BeamFeature = z.infer<typeof zBeamFeature>
export type Feature = z.infer<typeof zFeature>
export type FeatureType = Feature["type"]

export type WallFeature = Extract<Feature, { wall: string }>
export type FloorFeature = Extract<
  Feature,
  { type: "hearth" | "floor-socket" | "floor-obstacle" }
>
export type CeilingFeature = Extract<
  Feature,
  { type: "pendant" | "ceiling-light" | "spotlight" | "smoke-alarm" }
>

export const WALL_FEATURE_TYPES = [
  "door",
  "window",
  "opening",
  "radiator",
  "obstacle",
  "socket",
  "switch",
  "data",
  "aerial",
  "wall-light",
] as const satisfies readonly WallFeature["type"][]

export const FLOOR_FEATURE_TYPES = [
  "hearth",
  "floor-socket",
  "floor-obstacle",
] as const satisfies readonly FloorFeature["type"][]

export const CEILING_FEATURE_TYPES = [
  "pendant",
  "ceiling-light",
  "spotlight",
  "smoke-alarm",
] as const satisfies readonly CeilingFeature["type"][]

/** Prefix used when auto-assigning readable feature ids (D1, WIN1, …). */
export const FEATURE_ID_PREFIX = {
  door: "D",
  window: "WIN",
  opening: "OP",
  radiator: "RAD",
  obstacle: "OB",
  socket: "S",
  switch: "SW",
  data: "DATA",
  aerial: "AER",
  "wall-light": "WL",
  hearth: "H",
  "floor-socket": "FS",
  "floor-obstacle": "FOB",
  pendant: "L",
  "ceiling-light": "L",
  spotlight: "SP",
  "smoke-alarm": "SA",
  beam: "BM",
} as const satisfies Record<FeatureType, string>

export function isBeamFeature(feature: Feature): feature is BeamFeature {
  return feature.type === "beam"
}

export function isWallFeature(feature: Feature): feature is WallFeature {
  return "wall" in feature
}

export function isFloorFeature(feature: Feature): feature is FloorFeature {
  return (FLOOR_FEATURE_TYPES as readonly string[]).includes(feature.type)
}

export function isCeilingFeature(feature: Feature): feature is CeilingFeature {
  return (CEILING_FEATURE_TYPES as readonly string[]).includes(feature.type)
}
