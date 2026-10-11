import { z } from "zod"

import { zFeature } from "./features"
import {
  zCameraId,
  zLabel,
  zNonNegativeMm,
  zPositiveMm,
  zVec3,
} from "./primitives"
import { zShell } from "./shell"

// A room: its solved outline, fixed features, finishes (for render prompts)
// and saved camera viewpoints.

export const zFinishes = z
  .object({
    walls: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Wall paint, e.g. 'warm white, matt'"),
    floor: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Flooring, e.g. 'light natural oak boards'"),
    ceiling: z.string().trim().max(200).optional(),
    skirting: z.string().trim().max(200).optional(),
    notes: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .describe("Anything else the render should know (mood, light, styling)"),
  })
  .describe(
    "Room-level surface finishes (solid colours/materials). Per-wall finishes come later."
  )

export const zSkirting = z.object({
  height: zNonNegativeMm.describe("Skirting board height"),
  depth: zNonNegativeMm.describe(
    "Skirting board thickness (furniture against a wall sits this far off the plaster)"
  ),
})

export const zCamera = z.object({
  id: zCameraId,
  name: zLabel,
  position: zVec3.describe("Camera position [x, y, z] in mm; y = eye height"),
  target: zVec3.describe("Point the camera looks at [x, y, z] in mm"),
  fov: z
    .number()
    .min(10)
    .max(120)
    .describe("Vertical field of view in degrees (≈50 matches a phone camera)"),
})

export const zRoomSpec = z.object({
  name: zLabel,
  ceilingHeight: zPositiveMm,
  shell: zShell,
  skirting: zSkirting,
  features: z.array(zFeature).max(200),
  finishes: zFinishes,
  cameras: z.array(zCamera).max(50),
})

export type Finishes = z.infer<typeof zFinishes>
export type Skirting = z.infer<typeof zSkirting>
export type Camera = z.infer<typeof zCamera>
export type RoomSpec = z.infer<typeof zRoomSpec>

export const DEFAULT_SKIRTING: Skirting = { height: 150, depth: 18 }
export const DEFAULT_CEILING_HEIGHT = 2400
export const DEFAULT_EYE_HEIGHT = 1600
export const DEFAULT_CAMERA_FOV = 50
