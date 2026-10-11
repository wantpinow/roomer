/**
 * Seed data for the dev deployment (`pnpm seed`) and the e2e trapdoor:
 * Patrick's living room, the core test assets as a small generic library,
 * and a "Starter" layout with a sofa, coffee table and rug.
 *
 * Idempotent: anything that already exists (room by name, assets by key,
 * the layout by name within the room) is left alone, so re-running never
 * duplicates rows or overwrites edits. Everything goes through the real
 * `do*` helpers, so seeded data is data the app could have produced.
 */
import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_FINISHES,
  LIVING_ROOM_MEASUREMENTS,
  LIVING_ROOM_NAME,
  LIVING_ROOM_SKIRTING,
  TEST_ASSETS,
} from "@roomer/core/fixtures"
import { slugify } from "@roomer/core/placement"
import type { AssetSpec, LayoutOp } from "@roomer/core/schema"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"
import { doCreateAsset, getAssetByKey } from "./assets"
import type { MutationCtx } from "./functions"
import { doApplyChanges, doCreateLayout, MAX_LAYOUTS_PER_ROOM } from "./layouts"
import { doCreateRoom, doSyncRoom } from "./rooms"

export const SEED_LAYOUT_NAME = "Starter"

/** `coffeeTable` → `generic-coffee-table`. */
function libraryKey(name: string): string {
  return `generic-${slugify(name.replace(/([A-Z])/g, " $1"))}`
}

/** The core test assets as library items: "Test rug" → "Generic rug". */
export const SEED_ASSETS: { key: string; spec: AssetSpec }[] = Object.entries(
  TEST_ASSETS
).map(([name, spec]) => ({
  key: libraryKey(name),
  spec: { ...spec, name: spec.name.replace(/^Test /, "Generic ") },
}))

/** Sofa against the long left wall, coffee table in front, rug under it. */
export const SEED_LAYOUT_OPS: LayoutOp[] = [
  {
    op: "add",
    id: "sofa",
    asset: "generic-sofa",
    position: { mode: "against", wall: "W6", at: 3700 },
  },
  {
    op: "add",
    id: "coffee-table",
    asset: "generic-coffee-table",
    position: { mode: "centerOn", placement: "sofa", dx: 1175 },
  },
  {
    op: "add",
    id: "rug",
    asset: "generic-rug",
    position: { mode: "centerOn", placement: "coffee-table" },
  },
]

export type SeedResult = {
  roomId: Id<"rooms">
  layoutId: Id<"layouts">
  /** Asset ids by key. */
  assetIds: Record<string, Id<"assets">>
  /** What this run created (everything else already existed). */
  created: { room: boolean; assets: string[]; layout: boolean }
  /**
   * With `refresh`, what changed to bring an existing living room back in
   * line with the fixture (empty when it already matched); null when no
   * refresh was asked for or the room was only just created.
   */
  refreshed: string[] | null
}

/**
 * Bring the stored living room back in line with the fixture, in place (see
 * `doSyncRoom`): it keeps its id, layouts, reference photos and custom
 * cameras, and its default cameras are reset to today's defaults.
 */
export async function doRefreshLivingRoom(
  ctx: MutationCtx,
  room: Doc<"rooms">
): Promise<string[]> {
  return await doSyncRoom(ctx, {
    roomId: room._id,
    target: {
      measurements: LIVING_ROOM_MEASUREMENTS,
      ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
      skirting: LIVING_ROOM_SKIRTING,
      features: LIVING_ROOM_FEATURES,
      finishes: LIVING_ROOM_FINISHES,
    },
  })
}

export async function doSeed(
  ctx: MutationCtx,
  options: { refresh?: boolean } = {}
): Promise<SeedResult> {
  const existingRoom = await ctx.db
    .query("rooms")
    .withIndex("by_name", (q) => q.eq("name", LIVING_ROOM_NAME))
    .first()
  const roomId =
    existingRoom?._id ??
    (
      await doCreateRoom(ctx, {
        name: LIVING_ROOM_NAME,
        ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
        measurements: LIVING_ROOM_MEASUREMENTS,
        skirting: LIVING_ROOM_SKIRTING,
        features: LIVING_ROOM_FEATURES,
        finishes: LIVING_ROOM_FINISHES,
      })
    ).roomId

  const refreshed =
    options.refresh && existingRoom
      ? await doRefreshLivingRoom(ctx, existingRoom)
      : null

  const assetIds: Record<string, Id<"assets">> = {}
  const createdAssets: string[] = []
  for (const { key, spec } of SEED_ASSETS) {
    const existing = await getAssetByKey(ctx, key)
    if (existing) {
      assetIds[key] = existing._id
      continue
    }
    const { assetId } = await doCreateAsset(ctx, {
      ...spec,
      key,
      source: "library",
    })
    assetIds[key] = assetId
    createdAssets.push(key)
  }

  const layouts = await ctx.db
    .query("layouts")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_LAYOUTS_PER_ROOM)
  const existingLayout = layouts.find((l) => l.name === SEED_LAYOUT_NAME)
  let layoutId = existingLayout?._id
  if (!layoutId) {
    const created = await doCreateLayout(ctx, {
      roomId,
      name: SEED_LAYOUT_NAME,
      notes:
        "Seeded example: sofa against the long left wall (W6), coffee table in front of it, rug under the table.",
      actor: "system",
    })
    layoutId = created.layoutId
    await doApplyChanges(ctx, {
      layoutId,
      ops: SEED_LAYOUT_OPS,
      actor: "system",
    })
  }

  return {
    roomId,
    layoutId,
    assetIds,
    created: {
      room: !existingRoom,
      assets: createdAssets,
      layout: !existingLayout,
    },
    refreshed,
  }
}

export const vSeedResult = v.object({
  roomId: v.id("rooms"),
  layoutId: v.id("layouts"),
  assetIds: v.record(v.string(), v.id("assets")),
  created: v.object({
    room: v.boolean(),
    assets: v.array(v.string()),
    layout: v.boolean(),
  }),
  refreshed: v.union(v.array(v.string()), v.null()),
})

/**
 * `npx convex run seed:run` (what `pnpm seed` does); pass
 * `'{"refresh": true}'` (`pnpm seed --refresh`) to also bring an existing
 * living room back in line with the fixture.
 */
export const run = internalMutation({
  args: { refresh: v.optional(v.boolean()) },
  returns: vSeedResult,
  handler: async (ctx, args) => {
    return await doSeed(ctx, args)
  },
})
