import {
  zAssetSpec,
  zFeatureInput,
  zLayoutOp,
  zNewRoom,
  zPart,
  zPlacementPosition,
  zShellMeasurements,
  zShellOp,
} from "@roomer/core/schema"
import { z } from "zod"

import { looseUnion, unionReference } from "./compact"

// The compact listings and field references for the tools whose inputs are
// core's big unions (see compact.ts for why). Every reference line is
// generated from the core schema it describes.

const DEGREES = "degrees"

// --- room features ---------------------------------------------------------

const WALL_FIELDS = ["wall", "offset", "width", "bottom", "height"] as const

export const FEATURE_REFERENCE = [
  'Features (mm): type plus the fields below; optional id (default D1, WIN1, RAD1, …), label, assumed (true = estimated). "wall fields" = wall, offset (from the wall\'s start corner to the nearest edge), width (along the wall), bottom, height. Floor and ceiling features use room x, z.',
  ...unionReference(zFeatureInput, {
    omit: ["id", "label", "assumed"],
    groups: [{ label: "wall fields", fields: WALL_FIELDS }],
    hints: { facing: DEGREES },
  }),
].join("\n")

export const zListedFeature = looseUnion(
  zFeatureInput,
  "type plus its fields (see the description)"
)

// --- outline measurements --------------------------------------------------

export const MEASUREMENTS_REFERENCE = [
  "measurements by kind (mm; walls run clockwise from C1 at the top-left):",
  ...unionReference(zShellMeasurements, {
    hints: {
      sides: "[C1→C2, C2→C3, C3→C4, C4→C1]",
      corners: "[[x,z],…]",
      "walk.segments": `[{length, turn?},…] (turn = ${DEGREES} after that wall: +90 right (default), −90 left)`,
      "quad.cornerTriangles": "[{corner: 1–4, a, b, c},…]",
    },
  }),
].join("\n")

export const zListedMeasurements = looseUnion(
  zShellMeasurements,
  "kind plus its fields (see the description)"
)

// --- shell ops --------------------------------------------------------------

export const SHELL_OPS_REFERENCE = [
  "ops (applied in order):",
  ...unionReference(zShellOp, {
    hints: {
      "addFeature.feature": "{type, …fields}",
      "updateFeature.feature": "{type, …every field but id}",
    },
  }),
].join("\n")

export const zListedShellOp = looseUnion(
  zShellOp,
  "op plus its fields (see the description)"
)

// --- asset parts ------------------------------------------------------------

export const PART_REFERENCE = [
  "Parts by shape (mm). Every part: name, position [x,y,z] (its centre), rotation? [x°,y°,z°] (X→Y→Z), tone?: light|mid|dark.",
  ...unionReference(zPart, {
    omit: ["name", "position", "rotation", "tone"],
    hints: {
      size: "[w,h,d]",
      "extrude.profile":
        "[[u,v],…] (axis y: plan (x,z); x: side (z,y); z: front (x,y))",
      "lathe.profile": "[[radius,y],…] revolved around y",
    },
  }),
].join("\n")

export const zListedPart = looseUnion(
  zPart,
  "shape plus its fields (see the description)"
)

export const zListedAssetSpec = zAssetSpec.extend({
  geometry: z.object({
    kind: z.literal("parts"),
    parts: z.array(zListedPart).min(1).max(200),
  }),
})

/** update_asset's patch: any of create_asset's spec fields. */
export const zListedAssetPatch = z
  .looseObject({})
  .describe(
    "Only the fields to replace, shaped as in create_asset's spec (e.g. { geometry } or { dims, geometry }); geometry replaces every part"
  )

// --- layout ops and position helpers ----------------------------------------

export const LAYOUT_OPS_REFERENCE = [
  "ops (applied in order; ids are placement ids):",
  ...unionReference(zLayoutOp, {
    hints: {
      position: "{mode, …} (a position, below)",
      asset: "asset key or id",
      dx: "mm (world x)",
      dz: "mm (world z)",
      rotate: `${DEGREES} clockwise`,
    },
  }),
  "positions:",
  ...unionReference(zPlacementPosition, {
    hints: {
      facing: DEGREES,
      at: "mm along the wall from its start corner",
      placement: "placement id",
      feature: "feature id, e.g. L1",
      dx: "mm (world x)",
      dz: "mm (world z)",
    },
  }),
].join("\n")

export const zListedLayoutOp = looseUnion(
  zLayoutOp,
  "op plus its fields (see the description)"
)

// --- rooms -------------------------------------------------------------------

/** Listed stand-in for `zFinishes` (one description, not one per field). */
export const zListedFinishes = z
  .object({
    walls: z.string().optional(),
    floor: z.string().optional(),
    ceiling: z.string().optional(),
    skirting: z.string().optional(),
    notes: z.string().optional(),
  })
  .describe(
    "Solid colours/materials as short phrases for the photoreal prompt, e.g. walls 'warm white, matt', floor 'light natural oak boards'; notes = mood, light, styling"
  )

export const zListedNewRoom = zNewRoom.extend({
  measurements: zListedMeasurements,
  features: z.array(zListedFeature).max(200).optional(),
  finishes: zListedFinishes.optional(),
})

// --- cameras -----------------------------------------------------------------

const zXyz = z.array(z.number()).length(3)

/** Listed stand-in for a saved `zCamera` (the tool describes the fields). */
export const zListedCamera = z.object({
  id: z.string(),
  name: z.string(),
  position: zXyz,
  target: zXyz,
  fov: z.number(),
  projection: z.enum(["rectilinear", "fisheye"]).optional(),
})

/** Listed stand-in for `zViewCamera` (validated in full). */
export const zListedViewCamera = z.union([
  z.string().describe('A saved camera id, or "top" / "orbit" where allowed'),
  z
    .looseObject({ position: zXyz, target: zXyz })
    .describe(
      "Inline camera: position and target [x,y,z] in room mm (y = height; eye ≈ 1,500), fov? (vertical degrees, default 70), projection?: rectilinear|fisheye"
    ),
])

/** Listed stand-in for `zOrbit`. */
export const zListedOrbit = z
  .looseObject({})
  .describe(
    'For camera "orbit": azimuth? (plan bearing from the room\'s centre to the camera, default 225) and elevation? (degrees above the horizon, 5–89, default 45)'
  )
