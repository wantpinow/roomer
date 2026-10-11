import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import { toRoomGeometry } from "@roomer/core/geometry"
import {
  DEFAULT_PHOTOREAL_MODEL,
  type Camera,
  type PhotorealModel,
  type RenderQuality,
  type RenderSize,
} from "@roomer/core/schema"

import type { LayoutDetail, RoomDetail } from "../convex"
import {
  describeCameraForPrompt,
  describeRoomForPrompt,
} from "../photoreal/describe"
import { sniffImageMime } from "../photoreal/png"
import {
  generatePhotoreal,
  type GeneratePhotorealResult,
  type PhotorealLegendItem,
  type ReferenceImageSource,
  type RoomPhotoSource,
} from "../photoreal/pipeline"

import type { PipelineDeps } from "./deps"
import { invalidInput, notFound } from "./errors"
import {
  idPassVisibility,
  mergedFinishes,
  renderLayoutView,
  resolveView,
  sceneLegend,
  type ViewCamera,
} from "./views"

// The photoreal pipeline (spec §8) around the photoreal engineer's
// `generatePhotoreal`: create a pending render record (with a snapshot of
// the layout), render the clay and id passes, measure what each item covers
// in the id pass, fetch product photos, call the image model, store the
// passes and the result in Convex and complete the record — or fail it with
// the reason. `startPhotoreal` returns as soon as the record exists, so the
// UI can show a pending render while the work runs.

export const DEFAULT_PHOTOREAL_SIZE: RenderSize = { width: 1536, height: 1024 }
export const DEFAULT_PHOTOREAL_QUALITY: RenderQuality = "medium"

export interface PhotorealJob {
  layoutId: Id<"layouts">
  /** A saved camera id or an inline camera ("top"/"orbit" are refused). */
  camera: ViewCamera
  model?: PhotorealModel
  quality?: RenderQuality
  size?: RenderSize
  extraPrompt?: string
}

export interface PhotorealReference {
  assetId: string
  assetName: string
  placementIds: string[]
  /** Share of the frame, 0..1. */
  visibleFraction: number
}

export interface PhotorealOutcome {
  renderId: Id<"renders">
  png: Buffer
  /** The model that ran ("stub" when stubbed, whatever was asked for). */
  model: PhotorealModel
  quality: RenderQuality
  /** Whole pipeline, request to stored result. */
  durationMs: number
  /** Just the image model call. */
  modelDurationMs: number
  references: PhotorealReference[]
  skipped: (PhotorealReference & {
    reason: string
    /** Why a photo failed to load. */
    detail?: string
  })[]
  /** Photos of the real room sent for architecture and light. */
  roomPhotos: { sent: number; failed: number }
  outputUrl: string | null
  layoutRevision: number
}

export interface StartedPhotoreal {
  renderId: Id<"renders">
  model: PhotorealModel
  camera: Camera
  layoutRevision: number
  /** Settles when the render is stored (or failed and recorded). */
  finished: Promise<PhotorealOutcome>
}

function legendItems(
  layout: Pick<LayoutDetail, "placements" | "assets">
): PhotorealLegendItem[] {
  return sceneLegend(layout).map((entry) => {
    const description = layout.assets[entry.assetId]?.description
    return {
      placementId: entry.placementId,
      assetId: entry.assetId,
      name: entry.assetName ?? entry.label,
      ...(description ? { description } : {}),
      colorName: entry.colorName,
    }
  })
}

/** Image types every gateway image model accepts. */
export const MODEL_IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
])

/** An image the models accept, or an error saying how to fix it. */
async function loadModelImage(
  deps: Pick<PipelineDeps, "api">,
  url: string,
  fix: string
): Promise<{ data: Buffer; mime: string }> {
  const image = await deps.api.files.download(url)
  const mime = sniffImageMime(image.data) ?? image.mime
  if (!MODEL_IMAGE_TYPES.has(mime)) {
    throw new Error(`${mime} isn't accepted by the image models — ${fix}`)
  }
  return { data: image.data, mime }
}

/**
 * Each asset's primary product photo, loaded only if chosen. A photo in a
 * format the models refuse (e.g. AVIF from a CDN) fails to load — and so is
 * skipped rather than failing the render — with the reason in `failures`.
 */
function referenceSources(
  deps: Pick<PipelineDeps, "api">,
  layout: Pick<LayoutDetail, "assets">,
  failures: Map<string, string>
): Record<string, ReferenceImageSource[]> {
  return Object.fromEntries(
    Object.entries(layout.assets).map(([assetId, asset]) => {
      const url = asset.primaryImageUrl
      if (!url) return [assetId, []]
      const load = async () => {
        try {
          return await loadModelImage(
            deps,
            url,
            "re-add the photo with add_asset_images (replace: true) as JPEG, PNG or WebP"
          )
        } catch (error) {
          failures.set(
            assetId,
            error instanceof Error ? error.message : String(error)
          )
          throw error
        }
      }
      return [assetId, [{ primary: true, load }]]
    })
  )
}

/** The room's reference photos (architecture and light for the model). */
function roomPhotoSources(
  deps: Pick<PipelineDeps, "api">,
  room: Pick<RoomDetail, "referencePhotoUrls">
): RoomPhotoSource[] {
  return room.referencePhotoUrls.flatMap(({ url }) =>
    url
      ? [
          {
            load: () =>
              loadModelImage(
                deps,
                url,
                "add the room photo again as JPEG, PNG or WebP"
              ),
          },
        ]
      : []
  )
}

/** Render-record inputs: the passes sent, then each product photo used. */
async function recordInputs(
  deps: Pick<PipelineDeps, "api">,
  passes: { clay: Id<"_storage">; id: Id<"_storage"> },
  result: Pick<GeneratePhotorealResult, "inputs" | "references">
) {
  const sentIdPass = result.inputs.some((input) => input.role === "id")
  const inputs: {
    role: "clay" | "id" | "reference"
    storageId: Id<"_storage">
    placementId?: string
  }[] = [
    { role: "clay", storageId: passes.clay },
    ...(sentIdPass ? [{ role: "id" as const, storageId: passes.id }] : []),
  ]
  for (const reference of result.references) {
    const asset = await deps.api.assets.get({
      assetId: reference.assetId as Id<"assets">,
    })
    const image =
      asset?.images.find((i) => i.primary) ?? asset?.images[0] ?? undefined
    if (!image) continue
    inputs.push({
      role: "reference",
      storageId: image.storageId,
      ...(reference.placementIds[0]
        ? { placementId: reference.placementIds[0] }
        : {}),
    })
  }
  return inputs
}

function describeReference(
  layout: Pick<LayoutDetail, "assets">,
  reference: {
    assetId: string
    placementIds: string[]
    visibleFraction: number
  }
): PhotorealReference {
  return {
    assetId: reference.assetId,
    assetName: layout.assets[reference.assetId]?.name ?? reference.assetId,
    placementIds: reference.placementIds,
    visibleFraction: reference.visibleFraction,
  }
}

async function loadLayoutAndRoom(
  deps: Pick<PipelineDeps, "api">,
  layoutId: Id<"layouts">
): Promise<{ layout: LayoutDetail; room: RoomDetail }> {
  const layout = await deps.api.layouts.get({ layoutId })
  if (!layout) throw notFound(`There's no layout with id ${layoutId}.`)
  const room = await deps.api.rooms.get({ roomId: layout.roomId })
  if (!room) throw notFound(`Layout ${layoutId}'s room is missing.`)
  return { layout, room }
}

export async function startPhotoreal(
  deps: PipelineDeps,
  job: PhotorealJob
): Promise<StartedPhotoreal> {
  const started = deps.now()
  const quality = job.quality ?? DEFAULT_PHOTOREAL_QUALITY
  const size = job.size ?? DEFAULT_PHOTOREAL_SIZE
  const { layout, room } = await loadLayoutAndRoom(deps, job.layoutId)
  const { camera } = resolveView(room.cameras, job.camera)
  if (!camera) {
    throw invalidInput(
      `Photoreal renders need a perspective camera: a saved camera id (${room.cameras.map((c) => c.id).join(", ") || "none saved"}) or an inline { position, target, fov, projection? }. "top" and "orbit" can't be rendered photoreal.`
    )
  }
  // Fails fast (no record) when the model can't run, e.g. no API key.
  const renderer = deps.photoreal.renderer(job.model ?? DEFAULT_PHOTOREAL_MODEL)
  const { renderId, layoutRevision } = await deps.api.renders.create({
    layoutId: layout._id,
    kind: "photoreal",
    view: camera,
    model: renderer.id,
    quality,
  })

  const run = async (): Promise<PhotorealOutcome> => {
    const passes = await renderLayoutView(
      deps,
      {
        room,
        layout,
        view: { kind: "camera", camera },
        width: size.width,
        height: size.height,
      },
      ["clay", "id"]
    )
    const clay = passes.find((p) => p.pass === "clay")?.png
    const id = passes.find((p) => p.pass === "id")?.png
    if (!clay || !id) throw new Error("The renderer skipped a pass")
    const legend = sceneLegend(layout)
    const visibility = idPassVisibility(id, legend)
    const geometry = toRoomGeometry(room)
    const loadFailures = new Map<string, string>()
    const result = await generatePhotoreal({
      renderer,
      clay,
      id,
      legend: legendItems(layout),
      visibility,
      references: referenceSources(deps, layout, loadFailures),
      roomPhotos: roomPhotoSources(deps, room),
      finishes: mergedFinishes(room.finishes, layout.finishes),
      roomSummary: describeRoomForPrompt({ ...geometry, name: room.name }),
      cameraDescription: describeCameraForPrompt(camera, geometry),
      quality,
      size,
      ...(job.extraPrompt ? { extraPrompt: job.extraPrompt } : {}),
    })
    const clayId = await deps.api.files.upload(clay, "image/png")
    const idId = await deps.api.files.upload(id, "image/png")
    const output = await deps.api.files.upload(result.png, "image/png")
    const durationMs = Math.round(deps.now() - started)
    await deps.api.renders.complete({
      renderId,
      output,
      inputs: await recordInputs(deps, { clay: clayId, id: idId }, result),
      prompt: result.prompt,
      durationMs,
    })
    const stored = await deps.api.renders.get({ renderId })
    return {
      renderId,
      png: result.png,
      model: result.model,
      quality,
      durationMs,
      modelDurationMs: result.durationMs,
      references: result.references.map((r) => describeReference(layout, r)),
      skipped: result.skipped.map((s) => {
        const detail = loadFailures.get(s.assetId)
        return {
          ...describeReference(layout, s),
          reason: s.reason,
          ...(detail ? { detail } : {}),
        }
      }),
      roomPhotos: {
        sent: result.inputs.filter((input) => input.role === "room").length,
        failed: result.roomPhotosFailed,
      },
      outputUrl: stored?.outputUrl ?? null,
      layoutRevision,
    }
  }

  const finished = run().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await deps.api.renders.fail({
        renderId,
        error: message,
        durationMs: Math.round(deps.now() - started),
      })
    } catch (failError) {
      console.error(
        `[photoreal] could not mark render ${renderId} failed:`,
        failError instanceof Error ? failError.message : failError
      )
    }
    throw error
  })
  return { renderId, model: renderer.id, camera, layoutRevision, finished }
}
