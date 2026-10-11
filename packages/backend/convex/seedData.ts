/**
 * Export and import of design data (`seed/roomer.json`, see seedFile.ts):
 * the rooms, assets and layouts built in one deployment — by the agent over
 * MCP, by hand in the UI — written out by name and key so they can be
 * committed and recreated anywhere (`pnpm seed:export`, `pnpm seed --import`).
 *
 * Import is an idempotent upsert through the real helpers: rooms by name
 * (synced in place), assets by key (created or replaced), layouts by room
 * and name (contents replaced, re-linted). Product photos travel as their
 * source URLs; downloading them and rendering previews happen outside the
 * mutation (an action and the web app), driven by scripts/seed.ts.
 */
import { zodToConvex } from "convex-helpers/server/zod4"
import { ConvexError, v } from "convex/values"
import { z } from "zod"

import type { Doc, Id } from "./_generated/dataModel"
import { internalMutation, internalQuery } from "./_generated/server"
import {
  assetSpecOf,
  doCreateAsset,
  doReplaceAssetSpec,
  getAssetByKey,
} from "./assets"
import { appError, notFound, parseInput, type AppErrorData } from "./errors"
import type { MutationCtx, QueryCtx } from "./functions"
import {
  doCreateLayout,
  doReplaceLayoutContent,
  MAX_LAYOUTS_PER_ROOM,
} from "./layouts"
import { doCreateRoom, doSyncRoom } from "./rooms"
import {
  SEED_FILE_VERSION,
  zSeedAsset,
  zSeedFile,
  zSeedLayout,
  zSeedRoom,
  type SeedAsset,
  type SeedFile,
  type SeedLayout,
  type SeedRoom,
} from "./seedFile"
import type { StoredPlacement } from "./validators"

/** Most assets or layouts one export reads. */
export const MAX_EXPORT_ROWS = 1000

export type ImportStatus = "created" | "updated" | "unchanged"

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Everything worth keeping, keyed by name: every room, every asset (photos
 * as source URLs; uploaded ones without a URL can't travel and are left
 * out) and every layout that isn't archived. Ordered by room name, asset key
 * and layout name so the file diffs cleanly.
 */
export async function doExportSeed(ctx: QueryCtx): Promise<SeedFile> {
  const rooms = await ctx.db.query("rooms").withIndex("by_name").take(100)
  const assets = await ctx.db
    .query("assets")
    .withIndex("by_key")
    .take(MAX_EXPORT_ROWS)
  const keyOf = new Map(assets.map((asset) => [asset._id, asset.key]))

  const layouts: SeedLayout[] = []
  for (const room of rooms) {
    const roomLayouts = (
      await ctx.db
        .query("layouts")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .take(MAX_LAYOUTS_PER_ROOM)
    )
      .filter((layout) => layout.status !== "archived")
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const layout of roomLayouts) {
      layouts.push({
        room: room.name,
        name: layout.name,
        status: layout.status,
        ...(layout.notes !== undefined ? { notes: layout.notes } : {}),
        ...(layout.finishes ? { finishes: layout.finishes } : {}),
        placements: layout.placements.map(({ assetId, ...placement }) => {
          const assetKey = keyOf.get(assetId)
          if (!assetKey) {
            throw new Error(
              `Layout ${layout._id} places ${placement.id} as asset ${assetId}, which doesn't exist`
            )
          }
          return { ...placement, assetKey }
        }),
      })
    }
  }

  return {
    version: SEED_FILE_VERSION,
    rooms: rooms.map((room) => ({
      name: room.name,
      ceilingHeight: room.ceilingHeight,
      measurements: room.shell.measurements,
      skirting: room.skirting,
      finishes: room.finishes,
      features: room.features,
      cameras: room.cameras,
    })),
    assets: assets.map((asset) => ({
      key: asset.key,
      source: asset.source,
      ...assetSpecOf(asset),
      images: asset.images.flatMap((image) =>
        image.sourceUrl
          ? [{ sourceUrl: image.sourceUrl, primary: image.primary }]
          : []
      ),
    })),
    layouts,
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Re-throw an app error with the thing being imported named first. */
async function naming<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ConvexError) {
      const data: AppErrorData = error.data
      throw appError({ ...data, message: `${what}: ${data.message}` })
    }
    throw error
  }
}

export async function doImportRooms(
  ctx: MutationCtx,
  args: { rooms: z.input<typeof zSeedRoom>[] }
): Promise<
  {
    name: string
    roomId: Id<"rooms">
    status: ImportStatus
    changes: string[]
  }[]
> {
  const rooms: SeedRoom[] = parseInput(
    z.array(zSeedRoom),
    args.rooms,
    "rooms",
    ["rooms"]
  )
  const results = []
  for (const room of rooms) {
    const result = await naming(`Room '${room.name}'`, async () => {
      const existing = await ctx.db
        .query("rooms")
        .withIndex("by_name", (q) => q.eq("name", room.name))
        .first()
      const target = {
        measurements: room.measurements,
        ceilingHeight: room.ceilingHeight,
        skirting: room.skirting,
        features: room.features,
        finishes: room.finishes,
        cameras: room.cameras,
      }
      if (existing) {
        const changes = await doSyncRoom(ctx, { roomId: existing._id, target })
        return {
          name: room.name,
          roomId: existing._id,
          status:
            changes.length > 0 ? ("updated" as const) : ("unchanged" as const),
          changes,
        }
      }
      const { roomId } = await doCreateRoom(ctx, {
        name: room.name,
        ceilingHeight: room.ceilingHeight,
        measurements: room.measurements,
        skirting: room.skirting,
        features: room.features,
        finishes: room.finishes,
      })
      // Creation generated default cameras; the file's are authoritative.
      await doSyncRoom(ctx, { roomId, target })
      return {
        name: room.name,
        roomId,
        status: "created" as const,
        changes: [],
      }
    })
    results.push(result)
  }
  return results
}

export type ImportedAsset = {
  key: string
  assetId: Id<"assets">
  status: ImportStatus
  /** The asset has no photos but the file lists some to download. */
  needsImages: boolean
  /** Whether previews exist (else they need rendering by the web app). */
  hasPreviews: boolean
  warnings: string[]
}

export async function doImportAssets(
  ctx: MutationCtx,
  args: { assets: z.input<typeof zSeedAsset>[] }
): Promise<ImportedAsset[]> {
  const assets: SeedAsset[] = parseInput(
    z.array(zSeedAsset),
    args.assets,
    "assets",
    ["assets"]
  )
  const results: ImportedAsset[] = []
  for (const { key, source, images, ...spec } of assets) {
    const result = await naming(`Asset '${key}'`, async () => {
      const existing = await getAssetByKey(ctx, key)
      let assetId: Id<"assets">
      let status: ImportStatus
      let warnings: string[]
      if (existing) {
        const replaced = await doReplaceAssetSpec(ctx, {
          assetId: existing._id,
          spec,
          source,
        })
        assetId = existing._id
        status = replaced.changed ? "updated" : "unchanged"
        warnings = replaced.warnings
      } else {
        const created = await doCreateAsset(ctx, { ...spec, key, source })
        assetId = created.assetId
        status = "created"
        warnings = created.warnings
      }
      const stored = await ctx.db.get(assetId)
      if (!stored) throw new Error(`Asset ${assetId} vanished during import`)
      return {
        key,
        assetId,
        status,
        needsImages: stored.images.length === 0 && images.length > 0,
        hasPreviews: stored.previews.length > 0,
        warnings,
      }
    })
    results.push(result)
  }
  return results
}

export async function doImportLayouts(
  ctx: MutationCtx,
  args: { layouts: z.input<typeof zSeedLayout>[] }
): Promise<
  {
    room: string
    name: string
    layoutId: Id<"layouts">
    status: ImportStatus
  }[]
> {
  const layouts: SeedLayout[] = parseInput(
    z.array(zSeedLayout),
    args.layouts,
    "layouts",
    ["layouts"]
  )
  const assetIds = new Map<string, Id<"assets">>()
  const results = []
  for (const layout of layouts) {
    const what = `Layout '${layout.name}' in '${layout.room}'`
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_name", (q) => q.eq("name", layout.room))
      .first()
    if (!room) {
      throw notFound(
        `${what}: there's no room called '${layout.room}'. Import the room first (it must be in the file's rooms).`
      )
    }
    const placements: StoredPlacement[] = []
    for (const { assetKey, ...placement } of layout.placements) {
      let assetId = assetIds.get(assetKey)
      if (!assetId) {
        const asset = await getAssetByKey(ctx, assetKey)
        if (!asset) {
          throw notFound(
            `${what}: placement '${placement.id}' uses asset '${assetKey}', but no asset has that key. Add the asset to the file's assets or fix the key.`
          )
        }
        assetId = asset._id
        assetIds.set(assetKey, assetId)
      }
      placements.push({ ...placement, assetId })
    }

    const result = await naming(what, async () => {
      const existing = (
        await ctx.db
          .query("layouts")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .take(MAX_LAYOUTS_PER_ROOM)
      ).find((l) => l.name === layout.name && l.status !== "archived")
      const layoutId: Id<"layouts"> =
        existing?._id ??
        (
          await doCreateLayout(ctx, {
            roomId: room._id,
            name: layout.name,
            actor: "system",
          })
        ).layoutId
      const replaced = await doReplaceLayoutContent(ctx, {
        layoutId,
        placements,
        status: layout.status,
        ...(layout.notes !== undefined ? { notes: layout.notes } : {}),
        ...(layout.finishes ? { finishes: layout.finishes } : {}),
        actor: "system",
        summary: `Imported from the seed file (${placements.length} item${placements.length === 1 ? "" : "s"})`,
      })
      const status: ImportStatus = !existing
        ? "created"
        : replaced.changed
          ? "updated"
          : "unchanged"
      return { room: layout.room, name: layout.name, layoutId, status }
    })
    results.push(result)
  }
  return results
}

/**
 * Import a whole seed file in one transaction (tests, small files). The
 * script imports in sections instead, to keep each call small.
 */
export async function doImportSeed(ctx: MutationCtx, file: unknown) {
  const seed = parseInput(zSeedFile, file, "seed file")
  return {
    rooms: await doImportRooms(ctx, { rooms: seed.rooms }),
    assets: await doImportAssets(ctx, { assets: seed.assets }),
    layouts: await doImportLayouts(ctx, { layouts: seed.layouts }),
  }
}

/** Assets with no previews yet (for `pnpm seed --previews`). */
export async function doAssetsWithoutPreviews(
  ctx: QueryCtx
): Promise<{ assetId: Id<"assets">; key: string }[]> {
  const assets: Doc<"assets">[] = await ctx.db
    .query("assets")
    .withIndex("by_key")
    .take(MAX_EXPORT_ROWS)
  return assets
    .filter((asset) => asset.previews.length === 0)
    .map((asset) => ({ assetId: asset._id, key: asset.key }))
}

// ---------------------------------------------------------------------------
// Convex function exports (internal: run by scripts/seed*.ts via the CLI)
// ---------------------------------------------------------------------------

export const exportData = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await doExportSeed(ctx)
  },
})

export const importRooms = internalMutation({
  args: { rooms: v.array(zodToConvex(zSeedRoom)) },
  handler: async (ctx, args) => {
    return await doImportRooms(ctx, args)
  },
})

export const importAssets = internalMutation({
  args: { assets: v.array(zodToConvex(zSeedAsset)) },
  handler: async (ctx, args) => {
    return await doImportAssets(ctx, args)
  },
})

export const importLayouts = internalMutation({
  args: { layouts: v.array(zodToConvex(zSeedLayout)) },
  handler: async (ctx, args) => {
    return await doImportLayouts(ctx, args)
  },
})

export const assetsWithoutPreviews = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await doAssetsWithoutPreviews(ctx)
  },
})
