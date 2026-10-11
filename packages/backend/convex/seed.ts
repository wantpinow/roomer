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

import type { Id } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"
import { doCreateAsset, getAssetByKey } from "./assets"
import type { MutationCtx } from "./functions"
import { doApplyChanges, doCreateLayout, MAX_LAYOUTS_PER_ROOM } from "./layouts"
import { doCreateRoom } from "./rooms"

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
}

export async function doSeed(ctx: MutationCtx): Promise<SeedResult> {
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
})

/** `npx convex run seed:run` (what `pnpm seed` does). */
export const run = internalMutation({
  args: {},
  returns: vSeedResult,
  handler: async (ctx) => {
    return await doSeed(ctx)
  },
})
