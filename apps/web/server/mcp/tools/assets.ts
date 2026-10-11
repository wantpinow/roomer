import {
  assetLocalBounds,
  validateAsset,
  type Aabb3,
} from "@roomer/core/assets"
import { slugify } from "@roomer/core/placement"
import {
  zAssetCategory,
  zAssetKey,
  zAssetSpec,
  zPositiveMm,
  type AssetSpec,
} from "@roomer/core/schema"
import { z } from "zod"

import { zAssetPreviewView, type AssetPreviewView } from "@/lib/scene/types"

import type { AddImagesResult, AssetDetail, AssetSummary } from "../../convex"
import {
  normalizeViews,
  PREVIEW_VIEW_WORDS,
  renderAndStoreAssetPreviews,
  type AssetPreviewImage,
} from "../../pipelines/asset-previews"
import type { PipelineDeps } from "../../pipelines/deps"
import { assetDetail, assetList, boundsLine, dims } from "../format"
import { PART_REFERENCE, zListedAssetPatch, zListedAssetSpec } from "../listing"
import { resolveAsset } from "../lookup"
import { toolError, toolResult } from "../result"
import { zAssetRef, zImageUrls } from "../schemas"
import {
  comparisonSheet,
  markOrientation,
  photoToPng,
  SHEET_CELL,
  type SheetImage,
} from "../sheets"
import {
  defineTool,
  READ_ONLY,
  WRITES,
  type RoomerTool,
  WRITES_WEB,
} from "../tool"

const zSource = z
  .enum(["library", "custom"])
  .describe("library = starter set shipped with Roomer; custom = built by you")

const zPrimaryIndex = z
  .number()
  .int()
  .min(0)
  .max(2)
  .optional()
  .describe(
    "Which URL is the primary photo (sent to the image model); default 0"
  )

const zDryRun = z
  .boolean()
  .optional()
  .describe("Validate and render, saving nothing")

// --- pictures for the agent ----------------------------------------------------

/** Floor coverings are a line seen from the front or side: skip those. */
function shownViews(spec: Pick<AssetSpec, "mount">): AssetPreviewView[] {
  return spec.mount === "floor-covering"
    ? ["top", "iso"]
    : ["front", "side", "top", "iso"]
}

interface Pictures {
  images: Buffer[]
  /** One name per image, for files (`pnpm mcp` names them after these). */
  names: string[]
  /** "Images, in order: 1. …" plus anything the sheet couldn't use. */
  text: string
}

/**
 * Up to two product photos (primary first) as PNGs for a comparison sheet.
 * Photos that can't be fetched are skipped and reported, never fatal.
 */
async function loadPhotos(
  deps: Pick<PipelineDeps, "api">,
  urls: readonly { url: string; primary: boolean }[]
): Promise<{ photos: SheetImage[]; problems: string[] }> {
  const ordered = [...urls].sort(
    (a, b) => Number(b.primary) - Number(a.primary)
  )
  const photos: SheetImage[] = []
  const problems: string[] = []
  for (const [i, { url, primary }] of ordered.slice(0, 2).entries()) {
    try {
      const { data } = await deps.api.files.download(url)
      photos.push({
        png: await photoToPng(data, SHEET_CELL * 2),
        label: `PRODUCT PHOTO ${i + 1}${primary ? " · PRIMARY" : ""}`,
      })
    } catch (error) {
      problems.push(
        `Photo ${i + 1} couldn't be loaded for the comparison sheet (${error instanceof Error ? error.message : String(error)}).`
      )
    }
  }
  return { photos, problems }
}

/**
 * What the agent gets back for a model: the previews (top and iso with an
 * orientation marker) and, when there are product photos, one comparison
 * sheet of photo(s) | clay front | clay iso.
 */
async function modelPictures(
  deps: Pick<PipelineDeps, "api">,
  {
    name,
    key,
    spec,
    bounds,
    previews,
    photoUrls,
    views,
  }: {
    name: string
    key: string
    spec: Pick<AssetSpec, "mount">
    bounds: Aabb3
    previews: readonly AssetPreviewImage[]
    photoUrls: readonly { url: string; primary: boolean }[]
    /** Which previews to return; default all but a rug's front and side. */
    views?: readonly AssetPreviewView[]
  }
): Promise<Pictures> {
  const wanted = new Set(views ?? shownViews(spec))
  const marked = await Promise.all(
    previews.map(async ({ view, png }) => ({
      view,
      png: await markOrientation(png, view, bounds),
    }))
  )
  const shown = marked.filter((preview) => wanted.has(preview.view))
  const images = shown.map((preview) => preview.png)
  const names = shown.map((preview) => `${key}-${preview.view}`)
  const words = shown.map(
    (preview, i) => `${i + 1}. ${PREVIEW_VIEW_WORDS[preview.view]}`
  )
  const notes: string[] = []
  const front = marked.find((preview) => preview.view === "front")
  const iso = marked.find((preview) => preview.view === "iso")
  if (photoUrls.length === 0) {
    notes.push(
      "No product photos yet, so no comparison sheet — add them with imageUrls or add_asset_images."
    )
  } else if (front && iso) {
    const { photos, problems } = await loadPhotos(deps, photoUrls)
    notes.push(...problems)
    if (photos.length > 0) {
      images.push(
        await comparisonSheet({
          title: `${name} — product ${photos.length === 1 ? "photo" : "photos"} vs clay model`,
          photos,
          clay: [
            { png: front.png, label: "CLAY · FRONT" },
            { png: iso.png, label: "CLAY · ISO (3/4 FROM FRONT-RIGHT)" },
          ],
        })
      )
      names.push(`${key}-comparison`)
      words.push(
        `${images.length}. comparison sheet: the product ${photos.length === 1 ? "photo" : "photos"} beside the clay front and iso`
      )
    }
  }
  const marker = shown.some((p) => p.view === "top" || p.view === "iso")
    ? " Top and iso carry an orientation marker (bottom-left): x, front +z, y."
    : ""
  return {
    images,
    names,
    text: [
      images.length > 0
        ? `Images, in order: ${words.join("; ")}.${marker}`
        : "",
      ...notes,
    ]
      .filter(Boolean)
      .join("\n"),
  }
}

/** Previews may fail (renderer down) after a write that succeeded. */
async function tryPreviews(
  deps: Pick<PipelineDeps, "api" | "renderer">,
  target: Parameters<typeof renderAndStoreAssetPreviews>[1],
  views?: readonly AssetPreviewView[]
): Promise<{ images: AssetPreviewImage[]; error?: string }> {
  try {
    return {
      images: await renderAndStoreAssetPreviews(deps, target, views),
    }
  } catch (error) {
    return {
      images: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function photoUrlsOf(
  asset: Pick<AssetDetail, "imageUrls">
): { url: string; primary: boolean }[] {
  return asset.imageUrls.flatMap((image) =>
    image.url ? [{ url: image.url, primary: image.primary }] : []
  )
}

function imageResultLines(result: AddImagesResult): string[] {
  return result.results.map((r) =>
    r.ok ? `- stored ${r.url}` : `- failed ${r.url}: ${r.error}`
  )
}

/** A validation failure in the backend's words, one problem per line. */
function validationError(errors: readonly string[], dryRun: boolean) {
  return toolError(
    [
      `Error INVALID_INPUT: The model doesn't match its listing: ${errors.length} problem${errors.length === 1 ? "" : "s"}${dryRun ? " (dry run — nothing was saved)" : ""}.`,
      ...errors.map((error) => `- ${error}`),
    ].join("\n"),
    { errors }
  )
}

function dimsFilter(
  asset: Pick<AssetSummary, "dims">,
  max: { maxWidth?: number; maxDepth?: number; maxHeight?: number }
): boolean {
  return (
    (max.maxWidth === undefined || asset.dims.w <= max.maxWidth) &&
    (max.maxDepth === undefined || asset.dims.d <= max.maxDepth) &&
    (max.maxHeight === undefined || asset.dims.h <= max.maxHeight)
  )
}

// --- tools ---------------------------------------------------------------------

export const searchAssets = defineTool({
  name: "search_assets",
  title: "Search assets",
  description:
    "Search the library and your assets by text — name, key, tags, retailer, variant, category or product URL (an exact key or URL comes first, then assets matching every word) — plus category, source and maximum size (mm); returns key, name, W×D×H, price, photo/preview counts and id. Check here before building an asset (search the product URL); an empty query lists everything.",
  inputSchema: z.object({
    query: z
      .string()
      .max(500)
      .optional()
      .describe("Words, an asset key, or a product URL"),
    category: zAssetCategory.optional(),
    source: zSource.optional(),
    maxWidth: zPositiveMm.optional().describe("Max width (dims.w), mm"),
    maxDepth: zPositiveMm.optional().describe("Max depth (dims.d), mm"),
    maxHeight: zPositiveMm.optional().describe("Max height (dims.h), mm"),
    limit: z.number().int().min(1).max(100).optional().describe("Default 30"),
  }),
  annotations: READ_ONLY,
  async handler(args, { api }) {
    const limit = args.limit ?? 30
    const sized =
      args.maxWidth !== undefined ||
      args.maxDepth !== undefined ||
      args.maxHeight !== undefined
    const rows = await api.assets.search({
      query: args.query ?? "",
      ...(args.category ? { category: args.category } : {}),
      ...(args.source ? { source: args.source } : {}),
      limit: sized ? 100 : limit,
    })
    const matching = rows.filter((asset) => dimsFilter(asset, args))
    const shown = matching.slice(0, limit)
    return toolResult({
      text: assetList(shown, { total: matching.length }),
      structured: {
        assets: shown.map(
          ({ _id, key, name, category, mount, dims, source }) => ({
            _id,
            key,
            name,
            category,
            mount,
            dims,
            source,
          })
        ),
        total: matching.length,
      },
    })
  },
})

export const getAsset = defineTool({
  name: "get_asset",
  title: "Get asset",
  description:
    "One asset by key or id: size, mount, clearance, description, product link and price, parts (includeParts: true adds the JSON to edit), photo and preview URLs. includePreviews: true returns the stored previews (top and iso with an orientation marker); includePhotos: true returns the product photos as images.",
  inputSchema: z.object({
    asset: zAssetRef,
    includeParts: z.boolean().optional(),
    includePreviews: z.boolean().optional(),
    includePhotos: z.boolean().optional(),
  }),
  annotations: READ_ONLY,
  async handler(
    { asset: ref, includeParts, includePreviews, includePhotos },
    deps
  ) {
    const asset = await resolveAsset(deps.api, ref)
    const images: Buffer[] = []
    const names: string[] = []
    const notes: string[] = []
    if (includePreviews) {
      const bounds = assetLocalBounds(specOf(asset))
      for (const preview of asset.previewUrls) {
        if (!preview.url) continue
        const { data } = await deps.api.files.download(preview.url)
        images.push(await markOrientation(data, preview.view, bounds))
        names.push(`${asset.key}-${preview.view}`)
      }
    }
    if (includePhotos) {
      for (const [i, image] of asset.imageUrls.entries()) {
        if (!image.url) continue
        try {
          const { data } = await deps.api.files.download(image.url)
          images.push(await photoToPng(data))
          names.push(`${asset.key}-photo-${i + 1}`)
        } catch (error) {
          notes.push(
            `Photo ${i + 1} couldn't be loaded: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
      if (asset.imageUrls.length === 0) {
        notes.push("It has no product photos to return.")
      }
    }
    const order =
      images.length > 0 ? [`Images, in order: ${names.join(", ")}.`] : []
    return toolResult({
      text: [
        assetDetail(asset, { includeParts: includeParts ?? false }),
        ...order,
        ...notes,
      ].join("\n"),
      structured: { asset, imageNames: names },
      images,
    })
  },
})

function specOf(asset: AssetDetail): AssetSpec {
  return zAssetSpec.parse(asset)
}

/** The key a create would use: the one asked for, or the name's first free slug. */
async function keyFor(
  deps: Pick<PipelineDeps, "api">,
  requested: string | undefined,
  name: string
): Promise<{ key: string; taken?: AssetDetail }> {
  if (requested) {
    const taken = await deps.api.assets.getByKey({ key: requested })
    return taken ? { key: requested, taken } : { key: requested }
  }
  const base = slugify(name, "asset")
  for (let n = 1; n < 100; n++) {
    const key = n === 1 ? base : `${base}-${n}`
    if (!(await deps.api.assets.getByKey({ key }))) return { key }
  }
  return { key: `${base}-new` }
}

const zCreateAssetArgs = z.object({
  key: zAssetKey
    .optional()
    .describe(
      "Unique slug, e.g. castlery-mori-coffee-table-natural; default derived from the name"
    ),
  spec: zAssetSpec,
  imageUrls: zImageUrls.optional(),
  primaryIndex: zPrimaryIndex,
  dryRun: zDryRun,
})

export const createAsset = defineTool({
  name: "create_asset",
  title: "Create asset",
  description: [
    "Build furniture from parts, saved as your (custom) asset. Item-local mm: origin = footprint centre on the floor; +z = front, +x = the item's right (facing its front), +y = up. The parts' bounding box must equal dims (\u00b110mm), centred on the origin; floor items touch y = 0. Wall items: back at z = \u2212d/2 against the wall. Ceiling items: y = h touches the ceiling. Returns clay previews (top and iso marked with the axes; rugs only top and iso) and, with photos, a comparison sheet (photos | clay front | clay iso); refine with update_asset (2\u20133 rounds). dryRun: true validates and renders, saving nothing. imageUrls: 1\u20133 direct photo URLs. clearanceZones: exact free rectangles replacing `clearance` (an L-sofa's legroom).",
    PART_REFERENCE,
  ].join("\n\n"),
  inputSchema: zCreateAssetArgs,
  listedSchema: zCreateAssetArgs.extend({ spec: zListedAssetSpec }),
  annotations: WRITES_WEB,
  async handler({ key, spec, imageUrls, primaryIndex, dryRun }, deps) {
    if (dryRun) return await dryRunCreate(deps, { key, spec, imageUrls })
    const created = await deps.api.assets.create({
      ...spec,
      ...(key ? { key } : {}),
    })
    const lines = [
      `Created asset "${spec.name}" — key ${created.key} · id ${created.assetId}.`,
      boundsLine(created.bounds, spec.dims),
      ...created.warnings.map((w) => `Warning: ${w}`),
    ]
    let images: AddImagesResult | undefined
    if (imageUrls) {
      images = await deps.api.assets.addImagesFromUrls({
        assetId: created.assetId,
        urls: imageUrls,
        ...(primaryIndex !== undefined ? { primaryIndex } : {}),
      })
      lines.push("Photos:", ...imageResultLines(images))
    } else {
      lines.push("Photos: none yet — add 1–3 with add_asset_images.")
    }
    const previews = await tryPreviews(deps, {
      assetId: created.assetId,
      spec,
      previews: [],
    })
    let pictures: Pictures = { images: [], names: [], text: "" }
    if (previews.error) {
      lines.push(
        `The asset is saved, but its previews failed: ${previews.error} Retry with preview_asset.`
      )
    } else {
      const saved = images?.images.length
        ? await deps.api.assets.get({ assetId: created.assetId })
        : null
      pictures = await modelPictures(deps, {
        name: spec.name,
        key: created.key,
        spec,
        bounds: created.bounds,
        previews: previews.images,
        photoUrls: saved ? photoUrlsOf(saved) : [],
      })
      lines.push(
        pictures.text,
        "Compare them with the product photos and fix proportions with update_asset."
      )
    }
    return toolResult({
      text: lines.filter(Boolean).join("\n"),
      structured: {
        ...created,
        images: images?.images ?? [],
        imageNames: pictures.names,
      },
      images: pictures.images,
    })
  },
})

async function dryRunCreate(
  deps: PipelineDeps,
  {
    key: requested,
    spec,
    imageUrls,
  }: { key?: string; spec: AssetSpec; imageUrls?: string[] }
) {
  const validation = validateAsset(spec)
  if (!validation.ok) return validationError(validation.errors, true)
  const { key, taken } = await keyFor(deps, requested, spec.name)
  if (taken) {
    return toolError(
      `Error CONFLICT: An asset with key '${key}' already exists (${taken.name}, id ${taken._id}) — a real create would fail. Update it with update_asset, or choose another key. (Dry run — nothing was saved.)`
    )
  }
  const twins = spec.product
    ? (await deps.api.assets.search({ query: spec.product.url, limit: 5 }))
        .filter((row) => row.product?.url === spec.product?.url)
        .map(
          (row) =>
            `Warning: ${row.name} (key ${row.key}) has the same product URL — is this a duplicate?`
        )
    : []
  const previews = await deps.renderer.renderAssetPreviews(
    spec,
    normalizeViews(undefined)
  )
  const pictures = await modelPictures(deps, {
    name: spec.name,
    key,
    spec,
    bounds: validation.bounds,
    previews,
    photoUrls: (imageUrls ?? []).map((url, i) => ({ url, primary: i === 0 })),
  })
  return toolResult({
    text: [
      `Dry run — nothing was saved. "${spec.name}" is valid and would be created as key ${key}.`,
      boundsLine(validation.bounds, spec.dims),
      ...validation.warnings.map((w) => `Warning: ${w}`),
      ...twins,
      pictures.text,
      "Happy with it? Call create_asset again with the same arguments and without dryRun.",
    ]
      .filter(Boolean)
      .join("\n"),
    structured: {
      dryRun: true,
      key,
      warnings: validation.warnings,
      bounds: validation.bounds,
      imageNames: pictures.names,
    },
    images: pictures.images,
  })
}

/** Only these fields change how the asset looks. */
const VISUAL_FIELDS = ["dims", "geometry", "mount"] as const

const zAssetPatch = zAssetSpec
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Pass at least one field to change",
  })

export const updateAsset = defineTool({
  name: "update_asset",
  title: "Update asset",
  description:
    "Replace some of an asset's fields (geometry replaces every part; get_asset with includeParts: true shows the current ones). Validated like create_asset; when dims, geometry or mount change it returns fresh previews and the comparison sheet. dryRun: true validates and renders the change without saving it. Layouts using it are re-linted.",
  inputSchema: z.object({
    asset: zAssetRef,
    spec: zAssetPatch,
    dryRun: zDryRun,
  }),
  listedSchema: z.object({
    asset: zAssetRef,
    spec: zListedAssetPatch,
    dryRun: zDryRun,
  }),
  annotations: WRITES,
  async handler({ asset: ref, spec, dryRun }, deps) {
    const before = await resolveAsset(deps.api, ref)
    if (dryRun) return await dryRunUpdate(deps, before, spec)
    const result = await deps.api.assets.update({
      assetId: before._id,
      ...spec,
    })
    const after = await resolveAsset(deps.api, before._id)
    const lines = [
      `Updated "${after.name}" (${after.key}): ${Object.keys(spec).join(", ")}.`,
      boundsLine(result.bounds, after.dims),
      ...result.warnings.map((w) => `Warning: ${w}`),
      result.relintedLayouts > 0
        ? `Re-linting the ${result.relintedLayouts === 1 ? "layout that uses" : `${result.relintedLayouts} layouts that use`} it.`
        : "No layout uses it yet.",
    ]
    const visual = VISUAL_FIELDS.some((field) => field in spec)
    const previews = visual
      ? await tryPreviews(deps, {
          assetId: after._id,
          spec: specOf(after),
          previews: after.previews,
        })
      : { images: [] }
    let pictures: Pictures = { images: [], names: [], text: "" }
    if (previews.error) {
      lines.push(
        `Saved, but the previews failed: ${previews.error} Retry with preview_asset.`
      )
    } else if (visual) {
      pictures = await modelPictures(deps, {
        name: after.name,
        key: after.key,
        spec: after,
        bounds: result.bounds,
        previews: previews.images,
        photoUrls: photoUrlsOf(after),
      })
      lines.push(pictures.text)
    }
    return toolResult({
      text: lines.filter(Boolean).join("\n"),
      structured: {
        assetId: after._id,
        key: after.key,
        ...result,
        imageNames: pictures.names,
      },
      images: pictures.images,
    })
  },
})

async function dryRunUpdate(
  deps: PipelineDeps,
  before: AssetDetail,
  patch: Partial<AssetSpec>
) {
  const spec = zAssetSpec.parse({ ...specOf(before), ...patch })
  const validation = validateAsset(spec)
  if (!validation.ok) return validationError(validation.errors, true)
  const previews = await deps.renderer.renderAssetPreviews(
    spec,
    normalizeViews(undefined)
  )
  const pictures = await modelPictures(deps, {
    name: spec.name,
    key: before.key,
    spec,
    bounds: validation.bounds,
    previews,
    photoUrls: photoUrlsOf(before),
  })
  return toolResult({
    text: [
      `Dry run — nothing was saved. The change to "${before.name}" (${before.key}: ${Object.keys(patch).join(", ")}) is valid.`,
      boundsLine(validation.bounds, spec.dims),
      ...validation.warnings.map((w) => `Warning: ${w}`),
      pictures.text,
      "Happy with it? Call update_asset again with the same arguments and without dryRun.",
    ]
      .filter(Boolean)
      .join("\n"),
    structured: {
      dryRun: true,
      assetId: before._id,
      key: before.key,
      warnings: validation.warnings,
      bounds: validation.bounds,
      imageNames: pictures.names,
    },
    images: pictures.images,
  })
}

export const previewAsset = defineTool({
  name: "preview_asset",
  title: "Preview asset",
  description:
    "Re-render and store an asset's clay previews — all four, or the views listed: front, side (from its right), top (front faces down the image), iso (3/4 from front-right); top and iso carry an orientation marker. With product photos it also returns the comparison sheet (photo(s) | clay front | clay iso).",
  inputSchema: z.object({
    asset: zAssetRef,
    views: z.array(zAssetPreviewView).min(1).max(4).optional(),
  }),
  annotations: WRITES,
  async handler({ asset: ref, views }, deps) {
    const asset = await resolveAsset(deps.api, ref)
    const spec = specOf(asset)
    const rendered = await renderAndStoreAssetPreviews(
      deps,
      { assetId: asset._id, spec, previews: asset.previews },
      views
    )
    const pictures = await modelPictures(deps, {
      name: asset.name,
      key: asset.key,
      spec,
      bounds: assetLocalBounds(spec),
      previews: rendered,
      photoUrls: photoUrlsOf(asset),
      ...(views ? { views } : {}),
    })
    return toolResult({
      text: `Previews of "${asset.name}" (${asset.key}), ${dims(asset.dims)}.\n${pictures.text}`,
      structured: {
        assetId: asset._id,
        views: rendered.map((i) => i.view),
        imageNames: pictures.names,
      },
      images: pictures.images,
    })
  },
})

export const addAssetImages = defineTool({
  name: "add_asset_images",
  title: "Add product photos",
  description:
    "Attach 1–3 product photos from direct image URLs (at most 3 per asset; replace: true swaps them). The primary one is what the photoreal model sees — pick a clean white-background shot. Failures are reported per URL.",
  inputSchema: z.object({
    asset: zAssetRef,
    urls: zImageUrls,
    primaryIndex: zPrimaryIndex,
    replace: z
      .boolean()
      .optional()
      .describe("Replace the existing photos instead of adding"),
  }),
  annotations: WRITES_WEB,
  async handler({ asset: ref, urls, primaryIndex, replace }, { api }) {
    const asset = await resolveAsset(api, ref)
    const result = await api.assets.addImagesFromUrls({
      assetId: asset._id,
      urls,
      ...(primaryIndex !== undefined ? { primaryIndex } : {}),
      ...(replace !== undefined ? { replace } : {}),
    })
    const stored = result.results.filter((r) => r.ok).length
    const primary = result.images.findIndex((i) => i.primary)
    const text = [
      `${stored} of ${urls.length} photos stored for "${asset.name}"; it now has ${result.images.length}${primary >= 0 ? ` (primary: #${primary + 1})` : ""}.`,
      ...imageResultLines(result),
    ].join("\n")
    return stored === 0
      ? toolError(text, result)
      : toolResult({ text, structured: result })
  },
})

export const deleteAsset = defineTool({
  name: "delete_asset",
  title: "Delete asset",
  description:
    "Delete one of your own (custom) assets — a test, a duplicate, a model you're starting again. Refused for library assets and for assets placed in any layout (it lists them; remove or swap the placements first). Deletes its previews; its product photos stay in storage for past renders.",
  inputSchema: z.object({ asset: zAssetRef }),
  annotations: { destructiveHint: true, openWorldHint: false },
  async handler({ asset: ref }, { api }) {
    const asset = await resolveAsset(api, ref)
    if (asset.source === "library") {
      return toolError(
        `Error CONFLICT: ${asset.name} (${asset.key}) is a library asset (shipped with Roomer), so it can't be deleted; only your own custom assets can.`
      )
    }
    const { layouts } = await api.assets.usage({ assetId: asset._id })
    if (layouts.length > 0) {
      return toolError(
        [
          `Error CONFLICT: ${asset.name} (${asset.key}) wasn't deleted: it is placed in ${layouts.length} layout${layouts.length === 1 ? "" : "s"}:`,
          ...layouts.map(
            (l) =>
              `- '${l.layoutName}' (layout ${l.layoutId}): ${l.count} placement${l.count === 1 ? "" : "s"}`
          ),
          "Remove it there or swap it for another asset (apply_changes remove / swap), then delete it.",
        ].join("\n"),
        { layouts }
      )
    }
    await api.assets.remove({ assetId: asset._id })
    return toolResult({
      text: `Deleted "${asset.name}" (${asset.key}) and its previews.`,
      structured: { deleted: asset._id, key: asset.key },
    })
  },
})

export const assetTools: RoomerTool[] = [
  searchAssets,
  getAsset,
  createAsset,
  updateAsset,
  previewAsset,
  addAssetImages,
  deleteAsset,
]
