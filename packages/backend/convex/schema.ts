import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import {
  vActor,
  vAssetImage,
  vAssetPreview,
  vAssetSource,
  vAssetSpec,
  vCamera,
  vChange,
  vFinishes,
  vLayoutName,
  vLayoutNotes,
  vLayoutStatus,
  vLintCounts,
  vLintReport,
  vPhotorealModel,
  vRenderInput,
  vRenderKind,
  vRenderQuality,
  vRenderStatus,
  vRoomSpec,
  vStoredLayoutSpec,
  vStoredPlacement,
} from "./validators"

/**
 * Roomer's Convex schema.
 *
 * Domain shapes are defined once, as zod schemas in `@roomer/core`, and the
 * table validators are derived from them with `zodToConvex` in
 * validators.ts (see docs/2026-10-11-v1-architecture.md §2). Every field
 * carries a comment saying why it exists; every index is named `by_<field>`.
 *
 * When you add a table, also add it to `RESETTABLE_TABLES` in e2e.ts — the
 * typecheck fails until you do.
 */
const room = vRoomSpec.fields
const asset = vAssetSpec.fields

export default defineSchema({
  // Liveness check written by the e2e trapdoor and read by `health.ping`.
  healthchecks: defineTable({
    // Free text written by whoever recorded the check (the e2e trapdoor).
    note: v.string(),
  }),

  // A room's fixed parts: outline, features, finishes and saved cameras
  // (core RoomSpec). Layouts arrange furniture inside it.
  rooms: defineTable({
    // Display name, e.g. "Living room".
    name: room.name,
    // Single ceiling height (mm); bounds wall features and ceiling items.
    ceilingHeight: room.ceilingHeight,
    // Raw measurements plus the solved corners and the solver's report, so
    // the outline can be re-solved and the agent told how consistent it was.
    shell: room.shell,
    // Skirting board size: wall-relative placements stand off it.
    skirting: room.skirting,
    // Doors, windows, radiators, sockets, light fittings … with readable ids.
    features: room.features,
    // Surface finishes, fed into the photoreal render prompt.
    finishes: room.finishes,
    // Saved viewpoints for clay and photoreal renders.
    cameras: room.cameras,
    // Photos of the real room, used for render realism.
    referencePhotos: v.array(v.id("_storage")),
    // Last time anything about the room changed (ms since epoch).
    updatedAt: v.number(),
  })
    // Room list order, and the seed's "does the living room exist?" check.
    .index("by_name", ["name"]),

  // Furniture and other placeable things, built from simple parts
  // (core AssetSpec), plus their product photos and rendered previews.
  assets: defineTable({
    // Product or item name, e.g. "Harper dining table 220".
    name: asset.name,
    // Coarse type for browsing and filtering the library.
    category: asset.category,
    // How it sits in the room: floor, rug, on a wall or from the ceiling.
    mount: asset.mount,
    // Listed overall size (mm) — the truth the parts must match.
    dims: asset.dims,
    // The model: parts in item-local mm.
    geometry: asset.geometry,
    // Space that must stay free around it (drawers, legroom).
    clearance: asset.clearance,
    // Exact free-space rectangles (item-local) that replace `clearance` for
    // lint, e.g. legroom in front of an L-sofa's seats but not its chaise.
    clearanceZones: asset.clearanceZones,
    // Visual description for the photoreal prompt.
    description: asset.description,
    // Where it's sold, price and how the dims were obtained.
    product: asset.product,
    // Free-form search tags.
    tags: asset.tags,
    // Unique human-readable slug; agents can refer to assets by it.
    key: v.string(),
    // Shipped starter item, or one built for this home.
    source: vAssetSource,
    // Up to three product photos; exactly one is primary when any exist.
    images: v.array(vAssetImage),
    // Rendered previews (front/side/top/iso) of the current model.
    previews: v.array(vAssetPreview),
    // Words that find it in a search: name, key, tags, retailer, variant,
    // category and product URL (see assetSearchText). Optional only because
    // rows from before it existed lack it until assets:backfillSearchText.
    searchText: v.optional(v.string()),
    // Last time the spec, photos or previews changed (ms since epoch).
    updatedAt: v.number(),
  })
    // Resolving an agent's asset reference by key; enforcing uniqueness.
    .index("by_key", ["key"])
    // Duplicate check: other assets for the same product page.
    .index("by_product_url", ["product.url"])
    // Library listing in name order.
    .index("by_name", ["name"])
    // Library listing filtered by category, in name order.
    .index("by_category_name", ["category", "name"])
    // Filtered by source (and optionally category), in name order.
    .index("by_source_category_name", ["source", "category", "name"])
    // Free-text search over searchText, filterable like the listing.
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: ["category", "source"],
    }),

  // One candidate arrangement of a room's furniture.
  layouts: defineTable({
    // The room this layout furnishes.
    roomId: v.id("rooms"),
    // Display name, e.g. "Sofa facing the window".
    name: vLayoutName,
    // The agent's rationale or the user's notes.
    notes: v.optional(vLayoutNotes),
    // The layout this one was forked from, if any.
    parentId: v.optional(v.id("layouts")),
    // draft → candidate → favourite; archived hides it.
    status: vLayoutStatus,
    // Finishes overriding the room's (e.g. trying a darker wall colour).
    finishes: vStoredLayoutSpec.fields.finishes,
    // Resolved placements (x, z, facing, elevation) with Convex asset ids.
    placements: vStoredLayoutSpec.fields.placements,
    // Bumped on every content change (placements or finishes); renders
    // record it and `applyChanges` can require it to detect conflicts.
    revision: v.number(),
    // The lint report for the current layout, room and assets. Recomputed
    // whenever any of them changes.
    lint: vLintReport,
    // Last time the layout itself changed (ms since epoch).
    updatedAt: v.number(),
  })
    // A room's layouts.
    .index("by_room", ["roomId"]),

  // Which assets each layout uses, one row per (layout, asset) pair. Kept in
  // step with `layouts.placements` so an asset change can find the layouts
  // to re-lint, and an asset in use can't be deleted.
  layoutAssetRefs: defineTable({
    // The layout using the asset.
    layoutId: v.id("layouts"),
    // The asset placed at least once in that layout.
    assetId: v.id("assets"),
  })
    // Refs to rewrite when a layout's placements change.
    .index("by_layout", ["layoutId"])
    // Layouts to re-lint when an asset changes; deletion guard.
    .index("by_asset", ["assetId"]),

  // The activity feed: one row per change to a layout ("Claude moved the
  // sofa"), newest last.
  layoutEvents: defineTable({
    // The layout that changed.
    layoutId: v.id("layouts"),
    // The layout's revision after the change.
    revision: v.number(),
    // Who made the change.
    actor: vActor,
    // One human sentence, e.g. "Added sofa, moved coffee table 150mm right".
    summary: v.string(),
    // What each applied op did (empty for non-placement changes).
    changes: v.array(vChange),
    // Lint counts after the change, so the feed can show progress.
    lintCounts: vLintCounts,
    // Lint counts just before the change, so the feed can show what it fixed
    // or broke. Optional only because events from before this field existed
    // lack it; every new event sets it.
    lintCountsBefore: v.optional(vLintCounts),
    // When the change happened (ms since epoch).
    createdAt: v.number(),
  })
    // A layout's feed, in creation order.
    .index("by_layout", ["layoutId"])
    // A layout's latest change by a given actor ("is the agent active?").
    .index("by_layout_actor", ["layoutId", "actor"])
    // The app-wide latest change by an actor (the "Agent active" pill).
    .index("by_actor", ["actor"]),

  // Rendered images of a layout: clay and id passes, and photoreal renders.
  renders: defineTable({
    // The layout rendered.
    layoutId: v.id("layouts"),
    // Its room (for a room-wide gallery).
    roomId: v.id("rooms"),
    // clay / id pass, or a photoreal image.
    kind: vRenderKind,
    // pending → done | failed.
    status: vRenderStatus,
    // The camera used, copied so later camera edits don't change history.
    view: vCamera,
    // Image model (photoreal only).
    model: v.optional(vPhotorealModel),
    // Requested quality (photoreal only).
    quality: v.optional(vRenderQuality),
    // The prompt sent to the image model (photoreal only).
    prompt: v.optional(v.string()),
    // Images sent to the model: passes and product photos.
    inputs: v.array(vRenderInput),
    // The rendered image, once done.
    output: v.optional(v.id("_storage")),
    // The layout revision rendered.
    layoutRevision: v.number(),
    // Copy of the placements and finishes rendered, so renders can be
    // compared and reproduced after the layout moves on.
    layoutSnapshot: v.object({
      // Placements at render time.
      placements: v.array(vStoredPlacement),
      // Layout finishes override at render time.
      finishes: v.optional(vFinishes),
    }),
    // Why it failed, for failed renders.
    error: v.optional(v.string()),
    // Wall-clock render time (ms), once finished.
    durationMs: v.optional(v.number()),
    // When the render was requested (ms since epoch).
    createdAt: v.number(),
    // When it finished, successfully or not.
    completedAt: v.optional(v.number()),
  })
    // A layout's renders, oldest first.
    .index("by_layout", ["layoutId"])
    // A room's renders across layouts.
    .index("by_room", ["roomId"]),
})
