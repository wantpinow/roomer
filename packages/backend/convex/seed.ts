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
import { defaultCameras } from "@roomer/core/cameras"
import { toRoomGeometry } from "@roomer/core/geometry"
import type { AssetSpec, LayoutOp, ShellOp } from "@roomer/core/schema"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"
import { doCreateAsset, getAssetByKey } from "./assets"
import type { MutationCtx } from "./functions"
import { doApplyChanges, doCreateLayout, MAX_LAYOUTS_PER_ROOM } from "./layouts"
import {
  doApplyShellChanges,
  doCreateRoom,
  doRemoveCamera,
  doSetShell,
  doUpsertCamera,
  getRoomOrThrow,
} from "./rooms"

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

/** JSON with object keys sorted, so stored docs compare equal to literals. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1))
        )
      : inner
  )
}

const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b)

/**
 * Bring the stored living room back in line with the fixture, in place: the
 * room keeps its id, layouts, reference photos and custom cameras. Goes
 * through the real helpers — a re-solve if the measurements changed, then
 * one batch of shell ops (which validates the result and re-lints the
 * layouts) — and resets the default cameras, which earlier code may have
 * generated differently. Returns one sentence per change.
 */
export async function doRefreshLivingRoom(
  ctx: MutationCtx,
  room: Doc<"rooms">
): Promise<string[]> {
  const summaries: string[] = []
  const before = toRoomGeometry(room)

  if (!same(room.shell.measurements, LIVING_ROOM_MEASUREMENTS)) {
    // Features that don't fit the new outline are re-added from the fixture
    // by the ops below.
    await doSetShell(ctx, {
      roomId: room._id,
      measurements: LIVING_ROOM_MEASUREMENTS,
      dropInvalidFeatures: true,
    })
    summaries.push("Re-solved the outline from the fixture's measurements")
  }
  const current = await getRoomOrThrow(ctx, room._id)

  const fixtureIds = new Set(LIVING_ROOM_FEATURES.map((f) => f.id))
  const storedById = new Map(current.features.map((f) => [f.id, f]))
  const ops: ShellOp[] = [
    ...current.features
      .filter((feature) => !fixtureIds.has(feature.id))
      .map((feature): ShellOp => ({ op: "removeFeature", id: feature.id })),
    ...LIVING_ROOM_FEATURES.flatMap((feature): ShellOp[] => {
      const stored = storedById.get(feature.id)
      if (!stored) return [{ op: "addFeature", feature }]
      if (same(stored, feature)) return []
      const { id, ...replacement } = feature
      return [{ op: "updateFeature", id, feature: replacement }]
    }),
  ]
  if (current.ceilingHeight !== LIVING_ROOM_CEILING_HEIGHT) {
    ops.push({
      op: "setCeilingHeight",
      ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
    })
  }
  if (!same(current.skirting, LIVING_ROOM_SKIRTING)) {
    ops.push({ op: "setSkirting", skirting: LIVING_ROOM_SKIRTING })
  }
  if (!same(current.finishes, LIVING_ROOM_FINISHES)) {
    // setFinishes merges; an empty string removes a finish the fixture lacks.
    const cleared = Object.fromEntries(
      Object.keys(current.finishes).map((key) => [key, ""])
    )
    ops.push({
      op: "setFinishes",
      finishes: { ...cleared, ...LIVING_ROOM_FINISHES },
    })
  }
  if (ops.length > 0) {
    const { changes } = await doApplyShellChanges(ctx, {
      roomId: room._id,
      ops,
    })
    summaries.push(...changes.map((change) => change.summary))
  }

  // Default cameras: replace whatever is stored under a default id (it may
  // come from older defaults) with today's; leave custom cameras alone.
  const refreshed = await getRoomOrThrow(ctx, room._id)
  const defaults = defaultCameras(toRoomGeometry(refreshed))
  const defaultIds = new Set(
    [...defaultCameras(before), ...defaults].map((camera) => camera.id)
  )
  let reset = 0
  for (const camera of refreshed.cameras) {
    if (
      defaultIds.has(camera.id) &&
      !defaults.some((d) => d.id === camera.id)
    ) {
      await doRemoveCamera(ctx, { roomId: room._id, cameraId: camera.id })
      reset++
    }
  }
  for (const camera of defaults) {
    const stored = refreshed.cameras.find((c) => c.id === camera.id)
    if (!stored || !same(stored, camera)) {
      await doUpsertCamera(ctx, { roomId: room._id, camera })
      reset++
    }
  }
  if (reset > 0) {
    summaries.push(
      `Reset ${reset} default camera${reset === 1 ? "" : "s"} to the current defaults`
    )
  }
  return summaries
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
