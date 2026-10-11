// Which product photos go to the image model (spec §8 step 2). Pure: the
// caller supplies what the id pass saw and which images each asset has.
//
// - One image per *asset*: four identical chairs share one reference, and
//   their visible areas add up.
// - Largest on screen first, so if the model's input limit cuts the list
//   it is the small, background items that lose their reference.
// - Items covering less than ~0.3% of the frame are skipped: a photo of
//   something that small costs input budget and adds nothing.

/** Below this share of the frame an asset gets no reference image. */
export const MIN_REFERENCE_VISIBLE_FRACTION = 0.003

export interface Visibility {
  /** Pixels in the frame (width × height of the id pass). */
  totalPixels: number
  /** Visible pixels per placement id, from the id pass. Missing = 0. */
  byPlacement: Readonly<Record<string, number>>
}

export interface PlacementRef {
  id: string
  assetId: string
}

export interface ReferenceSelectionInput<TImage> {
  placements: readonly PlacementRef[]
  visibility: Visibility
  /** Each asset's images; the one flagged `primary` (else the first) is used. */
  imagesByAsset: Readonly<Record<string, readonly TImage[]>>
  /** Usually the model's input limit minus the passes. */
  maxReferences: number
  minVisibleFraction?: number
}

export interface SelectedReference<TImage> {
  assetId: string
  image: TImage
  placementIds: string[]
  visiblePixels: number
  /** Share of the frame, 0..1. */
  visibleFraction: number
}

export type ReferenceSkipReason =
  | "not-visible"
  | "too-small"
  | "no-image"
  | "over-limit"

export interface SkippedReference {
  assetId: string
  placementIds: string[]
  visibleFraction: number
  reason: ReferenceSkipReason
}

export interface ReferenceSelection<TImage> {
  selected: SelectedReference<TImage>[]
  skipped: SkippedReference[]
}

export function primaryImage<TImage extends { primary?: boolean }>(
  images: readonly TImage[]
): TImage | undefined {
  return images.find((image) => image.primary) ?? images[0]
}

/** Share of the frame a pixel count covers (0 when the frame is empty). */
export function visibleFraction(pixels: number, totalPixels: number): number {
  return totalPixels > 0 ? Math.max(0, pixels) / totalPixels : 0
}

export function selectReferences<TImage extends { primary?: boolean }>({
  placements,
  visibility,
  imagesByAsset,
  maxReferences,
  minVisibleFraction = MIN_REFERENCE_VISIBLE_FRACTION,
}: ReferenceSelectionInput<TImage>): ReferenceSelection<TImage> {
  // Group by asset in first-seen order (the tie-break for equal areas).
  const groups = new Map<string, { placementIds: string[]; pixels: number }>()
  for (const placement of placements) {
    const group = groups.get(placement.assetId) ?? {
      placementIds: [],
      pixels: 0,
    }
    group.placementIds.push(placement.id)
    group.pixels += Math.max(0, visibility.byPlacement[placement.id] ?? 0)
    groups.set(placement.assetId, group)
  }

  const ranked = [...groups.entries()]
    .map(([assetId, group]) => ({
      assetId,
      ...group,
      fraction: visibleFraction(group.pixels, visibility.totalPixels),
    }))
    .sort((a, b) => b.pixels - a.pixels)

  const limit = Math.max(0, Math.floor(maxReferences))
  const selected: SelectedReference<TImage>[] = []
  const skipped: SkippedReference[] = []
  for (const entry of ranked) {
    const skip = (reason: ReferenceSkipReason) =>
      skipped.push({
        assetId: entry.assetId,
        placementIds: entry.placementIds,
        visibleFraction: entry.fraction,
        reason,
      })
    const image = primaryImage(imagesByAsset[entry.assetId] ?? [])
    if (entry.pixels === 0) skip("not-visible")
    else if (entry.fraction < minVisibleFraction) skip("too-small")
    else if (image === undefined) skip("no-image")
    else if (selected.length >= limit) skip("over-limit")
    else {
      selected.push({
        assetId: entry.assetId,
        image,
        placementIds: entry.placementIds,
        visiblePixels: entry.pixels,
        visibleFraction: entry.fraction,
      })
    }
  }
  return { selected, skipped }
}
