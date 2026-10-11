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

function previewText(images: readonly AssetPreviewImage[]): string {
  return images.length === 0
    ? ""
    : `Preview images, in order: ${images.map((image, i) => `${i + 1}. ${PREVIEW_VIEW_WORDS[image.view]}`).join("; ")}.`
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

function imageResultLines(result: AddImagesResult): string[] {
  return result.results.map((r) =>
    r.ok ? `- stored ${r.url}` : `- failed ${r.url}: ${r.error}`
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

export const searchAssets = defineTool({
  name: "search_assets",
  title: "Search assets",
  description:
    "Search the library and your assets by name text, category, source and maximum size (mm); returns key, name, W\u00d7D\u00d7H, price, photo/preview counts and id. Check here before building an asset; an empty query lists everything.",
  inputSchema: z.object({
    query: z.string().max(200).optional().describe("Words from the name"),
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
    "One asset by key or id: size, mount, clearance, description, product link and price, parts (includeParts: true adds the JSON to edit), photo and preview URLs (includePreviews: true returns the preview images).",
  inputSchema: z.object({
    asset: zAssetRef,
    includeParts: z.boolean().optional(),
    includePreviews: z.boolean().optional(),
  }),
  annotations: READ_ONLY,
  async handler({ asset: ref, includeParts, includePreviews }, deps) {
    const asset = await resolveAsset(deps.api, ref)
    const previews = includePreviews
      ? await Promise.all(
          asset.previewUrls.flatMap((preview) =>
            preview.url
              ? [deps.api.files.download(preview.url).then((d) => d.data)]
              : []
          )
        )
      : []
    return toolResult({
      text: assetDetail(asset, { includeParts: includeParts ?? false }),
      structured: { asset },
      images: previews,
    })
  },
})

function specOf(asset: AssetDetail): AssetSpec {
  return zAssetSpec.parse(asset)
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
})

export const createAsset = defineTool({
  name: "create_asset",
  title: "Create asset",
  description: [
    "Build furniture from simple parts. Item-local mm: origin = footprint centre on the floor, +z = front, x = width, y = up. The parts' bounding box must equal dims (\u00b110mm), centred on the origin; floor items touch y = 0. Errors come back verbatim with the field path \u2014 fix and retry. Returns the four clay previews (front, side, top, iso) to compare with the product photos; refine with update_asset (2\u20133 rounds is plenty). imageUrls: 1\u20133 direct photo URLs to attach.",
    PART_REFERENCE,
  ].join("\n\n"),
  inputSchema: zCreateAssetArgs,
  listedSchema: zCreateAssetArgs.extend({ spec: zListedAssetSpec }),
  annotations: WRITES_WEB,
  async handler({ key, spec, imageUrls, primaryIndex }, deps) {
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
    lines.push(
      previews.error
        ? `The asset is saved, but its previews failed: ${previews.error} Retry with preview_asset.`
        : `${previewText(previews.images)} Compare them with the product photos and fix proportions with update_asset.`
    )
    return toolResult({
      text: lines.join("\n"),
      structured: { ...created, images: images?.images ?? [] },
      images: previews.images.map((p) => p.png),
    })
  },
})

/** Only these fields change how the asset looks. */
const VISUAL_FIELDS = ["dims", "geometry", "mount"] as const

export const updateAsset = defineTool({
  name: "update_asset",
  title: "Update asset",
  description:
    "Replace some of an asset's fields (geometry replaces every part; get_asset with includeParts: true shows the current ones). Validated like create_asset; returns fresh previews when dims, geometry or mount change. Layouts using it are re-linted.",
  inputSchema: z.object({
    asset: zAssetRef,
    spec: zAssetSpec
      .partial()
      .refine((patch) => Object.keys(patch).length > 0, {
        message: "Pass at least one field to change",
      }),
  }),
  listedSchema: z.object({ asset: zAssetRef, spec: zListedAssetPatch }),
  annotations: WRITES,
  async handler({ asset: ref, spec }, deps) {
    const before = await resolveAsset(deps.api, ref)
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
    if (previews.error) {
      lines.push(
        `Saved, but the previews failed: ${previews.error} Retry with preview_asset.`
      )
    } else if (visual) {
      lines.push(previewText(previews.images))
    }
    return toolResult({
      text: lines.join("\n"),
      structured: { assetId: after._id, key: after.key, ...result },
      images: previews.images.map((p) => p.png),
    })
  },
})

export const previewAsset = defineTool({
  name: "preview_asset",
  title: "Preview asset",
  description:
    "Re-render and store an asset's clay previews \u2014 all four, or the views listed: front, side (from its right), top (front faces down the image), iso (3/4 from front-right).",
  inputSchema: z.object({
    asset: zAssetRef,
    views: z.array(zAssetPreviewView).min(1).max(4).optional(),
  }),
  annotations: WRITES,
  async handler({ asset: ref, views }, deps) {
    const asset = await resolveAsset(deps.api, ref)
    const images = await renderAndStoreAssetPreviews(
      deps,
      { assetId: asset._id, spec: specOf(asset), previews: asset.previews },
      views
    )
    return toolResult({
      text: `Previews of "${asset.name}" (${asset.key}), ${dims(asset.dims)}. ${previewText(images)}`,
      structured: { assetId: asset._id, views: images.map((i) => i.view) },
      images: images.map((i) => i.png),
    })
  },
})

export const addAssetImages = defineTool({
  name: "add_asset_images",
  title: "Add product photos",
  description:
    "Attach 1\u20133 product photos from direct image URLs (at most 3 per asset; replace: true swaps them). The primary one is what the photoreal model sees \u2014 pick a clean white-background shot. Failures are reported per URL.",
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

export const assetTools: RoomerTool[] = [
  searchAssets,
  getAsset,
  createAsset,
  updateAsset,
  previewAsset,
  addAssetImages,
]
