import type {
  Finishes,
  PhotorealModel,
  RenderQuality,
  RenderSize,
} from "@roomer/core/schema"

import { pngSize, sniffImageMime } from "./png"
import { type PromptLegendEntry, buildPhotorealPrompt } from "./prompt"
import {
  type ReferenceSkipReason,
  type SkippedReference,
  type Visibility,
  selectReferences,
  visibleFraction,
} from "./references"
import {
  type ImageRenderer,
  type InputImage,
  type InputImageMeta,
  toInputImageMeta,
} from "./types"

// Spec §8 steps 2–4 as pure orchestration: choose product photos from what
// the id pass saw, number the images, build the prompt, call the renderer.
// Rendering the passes, counting id-pass pixels and storing the result are
// the caller's job (server/render + the MCP tool), so this runs the same in
// unit tests (fake renderer), the spike script and the app.

/** One placed item as the id pass painted it. */
export interface PhotorealLegendItem {
  placementId: string
  assetId: string
  /** Product / asset name, e.g. "Auburn 3 Seater Sofa". */
  name: string
  /** Asset's visual description for the prompt. */
  description?: string
  /** Its id-pass colour name, e.g. "red". */
  colorName: string
}

/** A product photo that is only fetched if it is chosen. */
export interface ReferenceImageSource {
  /** The asset's main photo; else the first listed is used. */
  primary?: boolean
  load(): Promise<{ data: Buffer; mime: string }>
}

export interface GeneratePhotorealInput {
  renderer: ImageRenderer
  /** Clay pass PNG — image 1. */
  clay: Buffer
  /** Id pass PNG — image 2. Omit to send no id map. */
  id?: Buffer
  legend: readonly PhotorealLegendItem[]
  /** Pixels per placement, from the id pass. */
  visibility: Visibility
  /** Product photos by asset id. Pass `{}` to send none. */
  references: Readonly<Record<string, readonly ReferenceImageSource[]>>
  finishes: Finishes
  roomSummary: string
  cameraDescription: string
  quality: RenderQuality
  /** Output size. Default: the clay pass's size. */
  size?: RenderSize | "auto"
  extraPrompt?: string
  /** Send at most this many product photos (on top of the model's limit). */
  maxReferences?: number
  minVisibleFraction?: number
  signal?: AbortSignal
  /** Clock for durationMs (tests). */
  now?: () => number
}

export type PhotorealSkipReason = ReferenceSkipReason | "load-failed"

export interface PhotorealReferenceUse {
  assetId: string
  placementIds: string[]
  /** Share of the frame, 0..1. */
  visibleFraction: number
  /** 1-based position among the input images. */
  imageIndex: number
}

export interface GeneratePhotorealResult {
  png: Buffer
  prompt: string
  /** Input images in order, without bytes (for the render record). */
  inputs: InputImageMeta[]
  /** The renderer that ran — "stub" when stubbed, whatever was asked for. */
  model: PhotorealModel
  durationMs: number
  references: PhotorealReferenceUse[]
  skipped: (Omit<SkippedReference, "reason"> & {
    reason: PhotorealSkipReason
  })[]
  raw?: unknown
}

export async function generatePhotoreal(
  input: GeneratePhotorealInput
): Promise<GeneratePhotorealResult> {
  const now = input.now ?? (() => performance.now())
  const started = now()
  const { renderer, legend } = input
  const withIdPass = input.id !== undefined
  const passCount = withIdPass ? 2 : 1
  const names = new Map(legend.map((item) => [item.assetId, item.name]))

  const { selected, skipped: unselected } = selectReferences({
    placements: legend.map((item) => ({
      id: item.placementId,
      assetId: item.assetId,
    })),
    visibility: input.visibility,
    imagesByAsset: input.references,
    maxReferences: Math.min(
      input.maxReferences ?? Infinity,
      renderer.maxInputImages - passCount
    ),
    ...(input.minVisibleFraction === undefined
      ? {}
      : { minVisibleFraction: input.minVisibleFraction }),
  })

  const loaded = await Promise.allSettled(
    selected.map((reference) => reference.image.load())
  )
  input.signal?.throwIfAborted()
  const skipped: GeneratePhotorealResult["skipped"] = [...unselected]

  const images: InputImage[] = [
    {
      role: "clay",
      data: input.clay,
      mime: "image/png",
      label: "clay render (the camera and layout to keep)",
    },
  ]
  if (input.id) {
    images.push({
      role: "id",
      data: input.id,
      mime: "image/png",
      label: "ID map (colour labels, not paint)",
    })
  }
  const references: PhotorealReferenceUse[] = []
  selected.forEach((reference, i) => {
    const result = loaded[i]!
    if (result.status === "rejected") {
      skipped.push({
        assetId: reference.assetId,
        placementIds: reference.placementIds,
        visibleFraction: reference.visibleFraction,
        reason: "load-failed",
      })
      return
    }
    const { data, mime } = result.value
    images.push({
      role: "reference",
      data,
      mime: sniffImageMime(data) ?? mime,
      label: `product photo: ${names.get(reference.assetId) ?? reference.assetId}`,
    })
    references.push({
      assetId: reference.assetId,
      placementIds: reference.placementIds,
      visibleFraction: reference.visibleFraction,
      imageIndex: images.length,
    })
  })

  const imageIndexOf = new Map(references.map((r) => [r.assetId, r.imageIndex]))
  const promptLegend: PromptLegendEntry[] = legend.map((item) => {
    const referenceIndex = imageIndexOf.get(item.assetId)
    return {
      colorName: item.colorName,
      name: item.name,
      ...(item.description ? { description: item.description } : {}),
      ...(referenceIndex === undefined ? {} : { referenceIndex }),
      visiblePct:
        100 *
        visibleFraction(
          input.visibility.byPlacement[item.placementId] ?? 0,
          input.visibility.totalPixels
        ),
    }
  })

  const prompt = buildPhotorealPrompt({
    finishes: input.finishes,
    roomSummary: input.roomSummary,
    legend: promptLegend,
    cameraDescription: input.cameraDescription,
    withIdPass,
    ...(input.extraPrompt ? { extraPrompt: input.extraPrompt } : {}),
  })

  const size = input.size ?? pngSize(input.clay) ?? "auto"
  const output = await renderer.render({
    prompt,
    images,
    size,
    quality: input.quality,
    ...(input.signal ? { signal: input.signal } : {}),
  })

  return {
    png: output.png,
    prompt,
    inputs: images.map(toInputImageMeta),
    model: renderer.id,
    durationMs: Math.round(now() - started),
    references,
    skipped,
    ...(output.raw === undefined ? {} : { raw: output.raw }),
  }
}
