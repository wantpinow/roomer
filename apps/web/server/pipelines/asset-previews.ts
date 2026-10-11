import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import type { AssetSpec } from "@roomer/core/schema"

import { ASSET_PREVIEW_VIEWS, type AssetPreviewView } from "@/lib/scene/types"

import type { PipelineDeps } from "./deps"

// Clay previews of an asset (front, side, top, iso): rendered headlessly,
// uploaded to Convex storage and attached to the asset, so the library and
// the agent see the same pictures. Re-rendering some views keeps the stored
// previews of the others.

export interface AssetPreviewImage {
  view: AssetPreviewView
  png: Buffer
}

/** What each preview shows, in the order they're returned. */
export const PREVIEW_VIEW_WORDS: Record<AssetPreviewView, string> = {
  front: "front (looking at the item's front)",
  side: "side (from the item's right)",
  top: "top (plan; the item's front faces down the image)",
  iso: "iso (3/4 view from front-right, above)",
}

/** The previews an asset will have after replacing `views`: theirs, ours. */
export function mergePreviews<Preview extends { view: AssetPreviewView }>(
  existing: readonly Preview[],
  replacements: readonly Preview[]
): Preview[] {
  const replaced = new Set(replacements.map((p) => p.view))
  const merged = [
    ...existing.filter((p) => !replaced.has(p.view)),
    ...replacements,
  ]
  return ASSET_PREVIEW_VIEWS.flatMap((view) =>
    merged.filter((p) => p.view === view)
  )
}

/** Unique views in canonical order (front, side, top, iso). */
export function normalizeViews(
  views: readonly AssetPreviewView[] | undefined
): AssetPreviewView[] {
  const wanted = new Set(
    views && views.length > 0 ? views : ASSET_PREVIEW_VIEWS
  )
  return ASSET_PREVIEW_VIEWS.filter((view) => wanted.has(view))
}

export interface PreviewTarget {
  assetId: Id<"assets">
  spec: AssetSpec
  /** The asset's current previews (kept for views not re-rendered). */
  previews: readonly { view: AssetPreviewView; storageId: Id<"_storage"> }[]
}

export async function renderAndStoreAssetPreviews(
  deps: Pick<PipelineDeps, "api" | "renderer">,
  target: PreviewTarget,
  views?: readonly AssetPreviewView[]
): Promise<AssetPreviewImage[]> {
  const rendered = await deps.renderer.renderAssetPreviews(
    target.spec,
    normalizeViews(views)
  )
  const stored = []
  for (const { view, png } of rendered) {
    stored.push({
      view,
      storageId: await deps.api.files.upload(png, "image/png"),
    })
  }
  await deps.api.assets.setPreviews({
    assetId: target.assetId,
    previews: mergePreviews(target.previews, stored),
  })
  return rendered
}
