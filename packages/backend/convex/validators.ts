/**
 * Convex validators derived from the zod schemas in @roomer/core.
 *
 * Core's zod schemas are the single source of truth for every domain shape
 * (architecture §2). This file converts them with `zodToConvex` and adds the
 * few shapes that only exist in the backend because they hold Convex ids
 * (placements' `assetId`, storage ids) — those are zod too, extended with
 * `zid(...)`, so even they are defined once and validated the same way.
 *
 * Type-level tests (tests/validators.test.ts) pin `Infer<typeof vX>` to
 * `z.infer<typeof zX>`.
 */
import type { Change } from "@roomer/core/placement"
import {
  zCamera,
  zFinishes,
  zLabel,
  zLayoutOp,
  zLayoutSpec,
  zLayoutStatus,
  zLintCounts,
  zLintReport,
  zNewRoom,
  zNote,
  zPhotorealModel,
  zPlacement,
  zPlacementId,
  zRenderKind,
  zRenderQuality,
  zRenderStatus,
  zRoomSpec,
  zShellMeasurements,
  zShellOp,
  zAssetSpec,
} from "@roomer/core/schema"
import { zid, zodToConvex } from "convex-helpers/server/zod4"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Backend-only zod schemas (they carry Convex ids)
// ---------------------------------------------------------------------------

/** A stored placement: core's placement with a real Convex asset id. */
export const zStoredPlacement = zPlacement.extend({
  assetId: zid("assets").describe("The placed asset"),
})

/** A stored layout's content (placements + optional finishes override). */
export const zStoredLayoutSpec = zLayoutSpec.extend({
  placements: z.array(zStoredPlacement).max(300),
})

/** Who made a change: the MCP agent, a person in the UI, or Roomer itself. */
export const zActor = z
  .enum(["agent", "user", "system"])
  .describe(
    "agent = Claude over MCP; user = a person in the web UI; system = Roomer (e.g. re-lint after the room changed)"
  )

export const zAssetSource = z
  .enum(["library", "custom"])
  .describe("library = starter set shipped with Roomer; custom = built by you")

export const ASSET_PREVIEW_VIEWS = ["front", "side", "top", "iso"] as const
export const zAssetPreviewView = z.enum(ASSET_PREVIEW_VIEWS)

/** Max product photos per asset (spec §5). */
export const MAX_ASSET_IMAGES = 3

export const zAssetImage = z.object({
  storageId: zid("_storage"),
  sourceUrl: z.url().optional().describe("Where the photo was downloaded from"),
  primary: z.boolean().describe("The photo sent to the image model"),
})

export const zAssetPreview = z.object({
  view: zAssetPreviewView,
  storageId: zid("_storage"),
})

/** One activity-feed entry per applied op (core `Change`). */
export const zChange = z.object({
  index: z.number().int().nonnegative(),
  op: z.enum(["add", "move", "nudge", "swap", "set", "remove"]),
  id: zPlacementId,
  summary: z.string(),
})

export const zRenderInputRole = z
  .enum(["clay", "id", "reference"])
  .describe(
    "clay/id = the passes rendered for this view; reference = a product photo"
  )

export const zRenderInput = z.object({
  role: zRenderInputRole,
  storageId: zid("_storage"),
  placementId: zPlacementId
    .optional()
    .describe("For references: the placement whose product this photo shows"),
})

// ---------------------------------------------------------------------------
// Convex validators
// ---------------------------------------------------------------------------

export const vRoomSpec = zodToConvex(zRoomSpec)
export const vNewRoom = zodToConvex(zNewRoom)
export const vShellMeasurements = zodToConvex(zShellMeasurements)
export const vShellOp = zodToConvex(zShellOp)
export const vCamera = zodToConvex(zCamera)
export const vFinishes = zodToConvex(zFinishes)

export const vAssetSpec = zodToConvex(zAssetSpec)
export const vAssetSource = zodToConvex(zAssetSource)
export const vAssetImage = zodToConvex(zAssetImage)
export const vAssetPreview = zodToConvex(zAssetPreview)
export const vAssetPreviewView = zodToConvex(zAssetPreviewView)

export const vLayoutName = zodToConvex(zLabel)
export const vLayoutNotes = zodToConvex(zNote)
export const vLayoutStatus = zodToConvex(zLayoutStatus)
export const vLayoutOp = zodToConvex(zLayoutOp)
export const vStoredPlacement = zodToConvex(zStoredPlacement)
export const vStoredLayoutSpec = zodToConvex(zStoredLayoutSpec)
export const vLintReport = zodToConvex(zLintReport)
export const vLintCounts = zodToConvex(zLintCounts)
export const vActor = zodToConvex(zActor)
export const vChange = zodToConvex(zChange)

export const vRenderKind = zodToConvex(zRenderKind)
export const vRenderStatus = zodToConvex(zRenderStatus)
export const vPhotorealModel = zodToConvex(zPhotorealModel)
export const vRenderQuality = zodToConvex(zRenderQuality)
export const vRenderInput = zodToConvex(zRenderInput)

export type Actor = z.infer<typeof zActor>
export type AssetSource = z.infer<typeof zAssetSource>
export type AssetImage = z.infer<typeof zAssetImage>
export type AssetPreview = z.infer<typeof zAssetPreview>
export type AssetPreviewView = z.infer<typeof zAssetPreviewView>
export type StoredPlacement = z.infer<typeof zStoredPlacement>
export type StoredLayoutSpec = z.infer<typeof zStoredLayoutSpec>
export type RenderInput = z.infer<typeof zRenderInput>

// `Change` is a TypeScript interface in core; zChange must describe exactly
// it, or events would store something other than what applyOps returns.
const _changeMatchesCore: [z.infer<typeof zChange>, Change] extends [
  Change,
  z.infer<typeof zChange>,
]
  ? true
  : never = true
void _changeMatchesCore
