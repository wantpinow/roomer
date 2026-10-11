/**
 * Assets: furniture built from simple parts, with product photos and
 * rendered previews. Creating or updating one validates the model (dims
 * match, nothing below the floor, …) and rejects it with every problem
 * listed; changing one re-lints every layout that uses it.
 */
import { validateAsset, type Aabb3 } from "@roomer/core/assets"
import { slugify, uniqueId } from "@roomer/core/placement"
import {
  zAssetCategory,
  zAssetKey,
  zAssetSpec,
  type AssetSpec,
} from "@roomer/core/schema"
import { zodToConvex } from "convex-helpers/server/zod4"
import { v, type Infer } from "convex/values"
import { z } from "zod"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { internalMutation, internalQuery } from "./_generated/server"
import {
  conflict,
  invalidInput,
  issuesAt,
  notFound,
  parseInput,
} from "./errors"
import {
  appAction,
  appMutation,
  appQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./functions"
import { scheduleAssetRelint } from "./layouts"
import {
  ASSET_PREVIEW_VIEWS,
  MAX_ASSET_IMAGES,
  vAssetImage,
  vAssetPreview,
  vAssetSource,
  vAssetSpec,
  zAssetImage,
  zAssetPreview,
  type AssetImage,
  type AssetPreview,
  type AssetSource,
} from "./validators"

/** Browser-like UA: many retailers refuse obvious bots. */
export const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
export const IMAGE_FETCH_TIMEOUT_MS = 15_000
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** Max rows a listing or search returns. */
export const MAX_ASSET_RESULTS = 500

const vAssetSpecPatch = zodToConvex(zAssetSpec.partial())
const vAssetCategory = zodToConvex(zAssetCategory)

// ---------------------------------------------------------------------------
// Helpers (thin-handler pattern — all logic lives here)
// ---------------------------------------------------------------------------

/** The AssetSpec fields of a stored asset (no ids, key, photos, …). */
export function assetSpecOf(asset: Doc<"assets">): AssetSpec {
  const {
    _id,
    _creationTime,
    key,
    source,
    images,
    previews,
    updatedAt,
    ...spec
  } = asset
  void [_id, _creationTime, key, source, images, previews, updatedAt]
  return spec
}

export async function getAssetOrThrow(
  ctx: QueryCtx,
  assetId: Id<"assets">
): Promise<Doc<"assets">> {
  const asset = await ctx.db.get(assetId)
  if (!asset) throw notFound(`There's no asset with id ${assetId}.`)
  return asset
}

export async function getAssetByKey(
  ctx: QueryCtx,
  key: string
): Promise<Doc<"assets"> | null> {
  return await ctx.db
    .query("assets")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()
}

/** An agent's asset reference: a Convex id or an asset key. */
export async function findAssetByRef(
  ctx: QueryCtx,
  ref: string
): Promise<Doc<"assets"> | null> {
  const id = ctx.db.normalizeId("assets", ref)
  if (id) return await ctx.db.get(id)
  return await getAssetByKey(ctx, ref)
}

/** Load assets by id; missing ones are simply absent from the map. */
export async function loadAssets(
  ctx: QueryCtx,
  ids: Iterable<Id<"assets">>
): Promise<Map<Id<"assets">, Doc<"assets">>> {
  const unique = [...new Set(ids)]
  const docs = await Promise.all(unique.map((id) => ctx.db.get(id)))
  const assets = new Map<Id<"assets">, Doc<"assets">>()
  for (const doc of docs) if (doc) assets.set(doc._id, doc)
  return assets
}

export async function primaryImageUrl(
  ctx: QueryCtx,
  asset: Doc<"assets">
): Promise<string | null> {
  const primary = asset.images.find((image) => image.primary)
  return primary ? await ctx.storage.getUrl(primary.storageId) : null
}

async function previewUrls(ctx: QueryCtx, asset: Doc<"assets">) {
  return await Promise.all(
    asset.previews.map(async (preview) => ({
      view: preview.view,
      url: await ctx.storage.getUrl(preview.storageId),
    }))
  )
}

/** List/search row: everything but the (possibly large) geometry. */
async function assetSummary(ctx: QueryCtx, asset: Doc<"assets">) {
  const { geometry, ...rest } = asset
  return {
    ...rest,
    partCount: geometry.parts.length,
    primaryImageUrl: await primaryImageUrl(ctx, asset),
    previewUrls: await previewUrls(ctx, asset),
  }
}

/** A full asset with photo and preview URLs. */
async function assetDetail(ctx: QueryCtx, asset: Doc<"assets">) {
  return {
    ...asset,
    imageUrls: await Promise.all(
      asset.images.map(async (image) => ({
        ...image,
        url: await ctx.storage.getUrl(image.storageId),
      }))
    ),
    primaryImageUrl: await primaryImageUrl(ctx, asset),
    previewUrls: await previewUrls(ctx, asset),
  }
}

/** Validation errors reject the asset; warnings are returned to the agent. */
function validateOrThrow(spec: AssetSpec) {
  const validation = validateAsset(spec)
  if (!validation.ok) {
    throw invalidInput(
      `The model doesn't match its listing: ${validation.errors.length} problem${validation.errors.length === 1 ? "" : "s"}.`,
      issuesAt("geometry", validation.errors)
    )
  }
  return validation
}

async function assertStoredFiles(
  ctx: QueryCtx,
  storageIds: readonly Id<"_storage">[]
): Promise<void> {
  for (const storageId of storageIds) {
    if (!(await ctx.db.system.get(storageId))) {
      throw notFound(`There's no uploaded file ${storageId}.`)
    }
  }
}

/** Exactly one primary photo when there are any: the first, unless chosen. */
function normalizePrimary(images: readonly AssetImage[]): AssetImage[] {
  const primaries = images.filter((image) => image.primary).length
  if (primaries === 1 || images.length === 0) return [...images]
  if (primaries > 1) {
    throw invalidInput(
      `${primaries} photos are marked primary; mark exactly one.`
    )
  }
  return images.map((image, i) => ({ ...image, primary: i === 0 }))
}

export async function doListAssets(
  ctx: QueryCtx,
  args: { category?: Doc<"assets">["category"]; source?: AssetSource }
) {
  const { category, source } = args
  const rows = await (
    source !== undefined
      ? ctx.db
          .query("assets")
          .withIndex("by_source_category_name", (q) =>
            category !== undefined
              ? q.eq("source", source).eq("category", category)
              : q.eq("source", source)
          )
      : category !== undefined
        ? ctx.db
            .query("assets")
            .withIndex("by_category_name", (q) => q.eq("category", category))
        : ctx.db.query("assets").withIndex("by_name")
  ).take(MAX_ASSET_RESULTS)
  // by_source_category_name orders by category first; the listing is by name.
  const sorted =
    source !== undefined && category === undefined
      ? [...rows].sort((a, b) => a.name.localeCompare(b.name))
      : rows
  return await Promise.all(sorted.map((asset) => assetSummary(ctx, asset)))
}

export async function doSearchAssets(
  ctx: QueryCtx,
  args: {
    query: string
    category?: Doc<"assets">["category"]
    source?: AssetSource
    limit?: number
  }
) {
  const text = args.query.trim()
  if (text === "") {
    const all = await doListAssets(ctx, args)
    return all.slice(0, args.limit ?? 50)
  }
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 100)
  const rows = await ctx.db
    .query("assets")
    .withSearchIndex("search_name", (q) => {
      const search = q.search("name", text)
      const byCategory =
        args.category !== undefined
          ? search.eq("category", args.category)
          : search
      return args.source !== undefined
        ? byCategory.eq("source", args.source)
        : byCategory
    })
    .take(limit)
  return await Promise.all(rows.map((asset) => assetSummary(ctx, asset)))
}

export async function doGetAsset(
  ctx: QueryCtx,
  args: { assetId: Id<"assets"> }
) {
  const asset = await ctx.db.get(args.assetId)
  return asset ? await assetDetail(ctx, asset) : null
}

export async function doGetAssetByKey(ctx: QueryCtx, args: { key: string }) {
  const asset = await getAssetByKey(ctx, args.key)
  return asset ? await assetDetail(ctx, asset) : null
}

/**
 * Which layouts place an asset, and how many times each. Refs say which
 * layouts; counting the layout's own placements keeps the number exact
 * without a second counter to maintain.
 */
export async function doAssetUsage(
  ctx: QueryCtx,
  args: { assetId: Id<"assets"> }
): Promise<{
  layouts: {
    layoutId: Id<"layouts">
    layoutName: string
    roomId: Id<"rooms">
    count: number
  }[]
}> {
  const refs = await ctx.db
    .query("layoutAssetRefs")
    .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
    .take(1000)
  const layouts = await Promise.all(
    [...new Set(refs.map((ref) => ref.layoutId))].map((id) => ctx.db.get(id))
  )
  return {
    layouts: layouts
      .flatMap((layout) =>
        layout
          ? [
              {
                layoutId: layout._id,
                layoutName: layout.name,
                roomId: layout.roomId,
                count: layout.placements.filter(
                  (p) => p.assetId === args.assetId
                ).length,
              },
            ]
          : []
      )
      .filter((usage) => usage.count > 0)
      .sort((a, b) => a.layoutName.localeCompare(b.layoutName)),
  }
}

export type CreateAssetArgs = Infer<typeof vAssetSpec> & {
  key?: string
  source?: AssetSource
}

export async function doCreateAsset(
  ctx: MutationCtx,
  args: CreateAssetArgs
): Promise<{
  assetId: Id<"assets">
  key: string
  warnings: string[]
  bounds: Aabb3
}> {
  const { key: requestedKey, source = "custom", ...fields } = args
  const spec = parseInput(zAssetSpec, fields, "asset")
  let key: string
  if (requestedKey !== undefined) {
    key = parseInput(zAssetKey, requestedKey, "asset key", ["key"])
    const existing = await getAssetByKey(ctx, key)
    if (existing) {
      throw conflict(
        `An asset with key '${key}' already exists (${existing.name}, id ${existing._id}). Update it with update_asset, or choose another key.`
      )
    }
  } else {
    key = await freeAssetKey(ctx, slugify(spec.name, "asset"))
  }
  const validation = validateOrThrow(spec)
  const assetId = await ctx.db.insert("assets", {
    ...spec,
    key,
    source,
    images: [],
    previews: [],
    updatedAt: Date.now(),
  })
  return {
    assetId,
    key,
    warnings: validation.warnings,
    bounds: validation.bounds,
  }
}

/** `base`, or `base-2`, `base-3`, … — the first key no asset uses. */
async function freeAssetKey(ctx: QueryCtx, base: string): Promise<string> {
  const taken = new Set<string>()
  for (;;) {
    const candidate = uniqueId(base, taken)
    if (!(await getAssetByKey(ctx, candidate))) return candidate
    taken.add(candidate)
  }
}

export type UpdateAssetArgs = { assetId: Id<"assets"> } & Infer<
  typeof vAssetSpecPatch
>

export async function doUpdateAsset(
  ctx: MutationCtx,
  args: UpdateAssetArgs
): Promise<{
  warnings: string[]
  bounds: Aabb3
  relintedLayouts: number
}> {
  const { assetId, ...patch } = args
  const asset = await getAssetOrThrow(ctx, assetId)
  const given = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  )
  if (Object.keys(given).length === 0) {
    throw invalidInput(
      "Nothing to update: pass at least one asset field (name, dims, geometry, …)."
    )
  }
  const spec = parseInput(
    zAssetSpec,
    { ...assetSpecOf(asset), ...given },
    "asset"
  )
  const validation = validateOrThrow(spec)
  await ctx.db.patch(asset._id, { ...spec, updatedAt: Date.now() })
  const relintedLayouts = await scheduleAssetRelint(
    ctx,
    asset._id,
    `${spec.name} was updated`
  )
  return {
    warnings: validation.warnings,
    bounds: validation.bounds,
    relintedLayouts,
  }
}

export async function doSetImages(
  ctx: MutationCtx,
  args: { assetId: Id<"assets">; images: Infer<typeof vAssetImage>[] }
): Promise<{ images: AssetImage[] }> {
  const asset = await getAssetOrThrow(ctx, args.assetId)
  const parsed = parseInput(
    z.array(zAssetImage).max(MAX_ASSET_IMAGES),
    args.images,
    "images",
    ["images"]
  )
  await assertStoredFiles(
    ctx,
    parsed.map((image) => image.storageId)
  )
  const images = normalizePrimary(parsed)
  await ctx.db.patch(asset._id, { images, updatedAt: Date.now() })
  return { images }
}

export async function doSetPreviews(
  ctx: MutationCtx,
  args: { assetId: Id<"assets">; previews: Infer<typeof vAssetPreview>[] }
): Promise<{ previews: AssetPreview[] }> {
  const asset = await getAssetOrThrow(ctx, args.assetId)
  const previews = parseInput(
    z.array(zAssetPreview).max(ASSET_PREVIEW_VIEWS.length),
    args.previews,
    "previews",
    ["previews"]
  )
  const views = previews.map((p) => p.view)
  const repeated = views.filter((view, i) => views.indexOf(view) !== i)
  if (repeated.length > 0) {
    throw invalidInput(
      `Each view may have one preview; ${[...new Set(repeated)].join(", ")} appear${repeated.length === 1 ? "s" : ""} more than once.`
    )
  }
  await assertStoredFiles(
    ctx,
    previews.map((p) => p.storageId)
  )
  await ctx.db.patch(asset._id, { previews, updatedAt: Date.now() })
  return { previews }
}

export async function doRemoveAsset(
  ctx: MutationCtx,
  args: { assetId: Id<"assets"> }
): Promise<void> {
  const asset = await getAssetOrThrow(ctx, args.assetId)
  const refs = await ctx.db
    .query("layoutAssetRefs")
    .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
    .take(50)
  if (refs.length > 0) {
    const layouts = await Promise.all(refs.map((r) => ctx.db.get(r.layoutId)))
    const names = layouts.flatMap((l) => (l ? [`'${l.name}'`] : []))
    throw conflict(
      `${asset.name} is placed in ${refs.length} layout${refs.length === 1 ? "" : "s"} (${names.join(", ")}). Remove or swap it there first.`
    )
  }
  // Previews belong to this asset alone. Product photos are kept: render
  // records may reference them as inputs.
  for (const preview of asset.previews) {
    await ctx.storage.delete(preview.storageId)
  }
  await ctx.db.delete(asset._id)
}

// --- downloading product photos ------------------------------------------

export type DownloadResult =
  | { ok: true; blob: Blob }
  | { ok: false; error: string }

/**
 * Fetch one image: http(s) only, browser-like headers, a 15s timeout, an
 * image/* content type and at most 10MB.
 */
export async function downloadImage(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<DownloadResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: "Not a valid URL." }
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http(s) URLs can be downloaded." }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(parsed.href, {
      headers: {
        "User-Agent": DESKTOP_USER_AGENT,
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    })
    if (!response.ok) {
      return {
        ok: false,
        error: `The server answered HTTP ${response.status}. If the site blocks downloads, send the image as base64 instead.`,
      }
    }
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.startsWith("image/")) {
      return {
        ok: false,
        error: `Not an image (content type '${contentType || "unknown"}'). Use the direct image URL, not the product page.`,
      }
    }
    const declared = Number(response.headers.get("content-length") ?? 0)
    if (declared > MAX_IMAGE_BYTES) {
      return { ok: false, error: tooLarge(declared) }
    }
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return { ok: false, error: tooLarge(bytes.byteLength) }
    }
    return { ok: true, blob: new Blob([bytes], { type: contentType }) }
  } catch (error) {
    return {
      ok: false,
      error: controller.signal.aborted
        ? `Timed out after ${IMAGE_FETCH_TIMEOUT_MS / 1000}s.`
        : `Download failed: ${error instanceof Error ? error.message : String(error)}.`,
    }
  } finally {
    clearTimeout(timer)
  }
}

function tooLarge(bytes: number): string {
  return `The image is ${(bytes / 1024 / 1024).toFixed(1)}MB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`
}

export type AddImagesFromUrlsArgs = {
  assetId: Id<"assets">
  urls: string[]
  primaryIndex?: number
  replace?: boolean
}

export type UrlResult =
  | { url: string; ok: true; storageId: Id<"_storage"> }
  | { url: string; ok: false; error: string }

export async function doAddImagesFromUrls(
  ctx: ActionCtx,
  args: AddImagesFromUrlsArgs,
  fetchImpl: typeof fetch = fetch
): Promise<{ results: UrlResult[]; images: AssetImage[] }> {
  const { urls, primaryIndex } = args
  if (urls.length === 0 || urls.length > MAX_ASSET_IMAGES) {
    throw invalidInput(
      `Give between 1 and ${MAX_ASSET_IMAGES} image URLs (got ${urls.length}).`
    )
  }
  if (
    primaryIndex !== undefined &&
    (!Number.isInteger(primaryIndex) ||
      primaryIndex < 0 ||
      primaryIndex >= urls.length)
  ) {
    throw invalidInput(
      `primaryIndex ${primaryIndex} doesn't point at one of the ${urls.length} URLs (0–${urls.length - 1}).`
    )
  }
  const existing: number | null = await ctx.runQuery(
    internal.assets.imageCount,
    { assetId: args.assetId }
  )
  if (existing === null) {
    throw notFound(`There's no asset with id ${args.assetId}.`)
  }
  if (!args.replace && existing + urls.length > MAX_ASSET_IMAGES) {
    throw invalidInput(
      `The asset already has ${existing} photo${existing === 1 ? "" : "s"}; adding ${urls.length} would exceed ${MAX_ASSET_IMAGES}. Pass replace: true to replace them.`
    )
  }

  // Download in parallel (the slow part); store one at a time.
  const downloads = await Promise.all(
    urls.map((url) => downloadImage(url, fetchImpl))
  )
  const results: UrlResult[] = []
  for (const [i, download] of downloads.entries()) {
    const url = urls[i]!
    if (!download.ok) {
      results.push({ url, ok: false, error: download.error })
    } else {
      const storageId = await ctx.storage.store(download.blob)
      results.push({ url, ok: true, storageId })
    }
  }
  const added = results.flatMap((result, i) =>
    result.ok
      ? [
          {
            storageId: result.storageId,
            sourceUrl: result.url,
            primary: i === primaryIndex,
          },
        ]
      : []
  )
  const images: AssetImage[] =
    added.length === 0
      ? []
      : await ctx.runMutation(internal.assets.attachImages, {
          assetId: args.assetId,
          images: added,
          replace: args.replace ?? false,
        })
  return { results, images }
}

export async function doImageCount(
  ctx: QueryCtx,
  args: { assetId: Id<"assets"> }
): Promise<number | null> {
  const asset = await ctx.db.get(args.assetId)
  return asset ? asset.images.length : null
}

/** Attach downloaded photos; a new primary takes over from the old one. */
export async function doAttachImages(
  ctx: MutationCtx,
  args: {
    assetId: Id<"assets">
    images: AssetImage[]
    replace: boolean
  }
): Promise<AssetImage[]> {
  const asset = await getAssetOrThrow(ctx, args.assetId)
  const newPrimary = args.images.some((image) => image.primary)
  const kept = args.replace
    ? []
    : asset.images.map((image) =>
        newPrimary ? { ...image, primary: false } : image
      )
  const combined = [...kept, ...args.images]
  if (combined.length > MAX_ASSET_IMAGES) {
    throw invalidInput(
      `An asset can have at most ${MAX_ASSET_IMAGES} photos; it would have ${combined.length}.`
    )
  }
  const images = normalizePrimary(combined)
  await ctx.db.patch(asset._id, { images, updatedAt: Date.now() })
  return images
}

// ---------------------------------------------------------------------------
// Convex function exports
// ---------------------------------------------------------------------------

export const list = appQuery({
  args: {
    category: v.optional(vAssetCategory),
    source: v.optional(vAssetSource),
  },
  handler: async (ctx, args) => {
    return await doListAssets(ctx, args)
  },
})

export const search = appQuery({
  args: {
    query: v.string(),
    category: v.optional(vAssetCategory),
    source: v.optional(vAssetSource),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await doSearchAssets(ctx, args)
  },
})

export const get = appQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    return await doGetAsset(ctx, args)
  },
})

export const getByKey = appQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await doGetAssetByKey(ctx, args)
  },
})

export const usage = appQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    return await doAssetUsage(ctx, args)
  },
})

export const create = appMutation({
  args: {
    ...vAssetSpec.fields,
    key: v.optional(v.string()),
    source: v.optional(vAssetSource),
  },
  handler: async (ctx, args) => {
    return await doCreateAsset(ctx, args)
  },
})

export const update = appMutation({
  args: { assetId: v.id("assets"), ...vAssetSpecPatch.fields },
  handler: async (ctx, args) => {
    return await doUpdateAsset(ctx, args)
  },
})

export const setImages = appMutation({
  args: { assetId: v.id("assets"), images: v.array(vAssetImage) },
  handler: async (ctx, args) => {
    return await doSetImages(ctx, args)
  },
})

export const setPreviews = appMutation({
  args: { assetId: v.id("assets"), previews: v.array(vAssetPreview) },
  handler: async (ctx, args) => {
    return await doSetPreviews(ctx, args)
  },
})

export const remove = appMutation({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    await doRemoveAsset(ctx, args)
  },
})

export const addImagesFromUrls = appAction({
  args: {
    assetId: v.id("assets"),
    urls: v.array(v.string()),
    primaryIndex: v.optional(v.number()),
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await doAddImagesFromUrls(ctx, args)
  },
})

export const imageCount = internalQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    return await doImageCount(ctx, args)
  },
})

export const attachImages = internalMutation({
  args: {
    assetId: v.id("assets"),
    images: v.array(vAssetImage),
    replace: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await doAttachImages(ctx, args)
  },
})
