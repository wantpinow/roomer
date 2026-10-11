import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import {
  zAssetSpec,
  zPhotorealModel,
  zRenderQuality,
  zRenderSize,
} from "@roomer/core/schema"
import { z } from "zod"

import { zAssetPreviewView } from "@/lib/scene/types"

import { describeError } from "../mcp/errors"

import { renderAndStoreAssetPreviews } from "./asset-previews"
import type { PipelineDeps } from "./deps"
import { invalidInput, notFound } from "./errors"
import { planSvgFor } from "./plan"
import { startPhotoreal } from "./photoreal"
import { zViewCamera } from "./views"

// The pipelines behind the UI's route handlers (app/api/layouts/**,
// app/api/assets/**), as plain functions of (deps, ids, request) → Response
// so they're testable without Next. Failures become JSON `{ error, code }`
// with an HTTP status from the error's code.

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_INPUT: 400,
  INVALID_OP: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DOWNLOAD_FAILED: 502,
  PHOTOREAL_AUTH: 503,
  PHOTOREAL_RATE_LIMIT: 429,
  PHOTOREAL_BAD_REQUEST: 400,
  PHOTOREAL_MODERATION: 422,
  PHOTOREAL_TIMEOUT: 504,
  PHOTOREAL_UPSTREAM: 502,
}

export function errorResponse(error: unknown): Response {
  const described = describeError(error)
  const status = STATUS_BY_CODE[described.code] ?? 500
  if (status === 500) {
    console.error("[api] unexpected error:", described.message)
  }
  return Response.json(
    { error: described.message, code: described.code },
    { status }
  )
}

/** JSON body parsed with `schema`; an empty body counts as `{}`. */
async function readBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema
): Promise<z.output<Schema>> {
  const text = await request.text()
  let json: unknown = {}
  if (text.trim() !== "") {
    try {
      json = JSON.parse(text)
    } catch {
      throw invalidInput("The request body isn't valid JSON.")
    }
  }
  return schema.parse(json)
}

export const zStartRenderBody = z.object({
  camera: zViewCamera,
  model: zPhotorealModel.optional(),
  quality: zRenderQuality.optional(),
  size: zRenderSize.optional(),
  extraPrompt: z.string().trim().max(1000).optional(),
})

/**
 * POST /api/layouts/[layoutId]/renders — start a photoreal render and
 * answer 202 { renderId } at once; `schedule` keeps the work running after
 * the response (Next's `after`). The UI follows the render record in Convex.
 */
export async function startRenderRoute(
  deps: PipelineDeps,
  layoutId: string,
  request: Request,
  schedule: (task: () => Promise<void>) => void
): Promise<Response> {
  try {
    const body = await readBody(request, zStartRenderBody)
    const started = await startPhotoreal(deps, {
      layoutId: layoutId as Id<"layouts">,
      camera: body.camera,
      ...(body.model ? { model: body.model } : {}),
      ...(body.quality ? { quality: body.quality } : {}),
      ...(body.size ? { size: body.size } : {}),
      ...(body.extraPrompt ? { extraPrompt: body.extraPrompt } : {}),
    })
    schedule(async () => {
      try {
        await started.finished
      } catch (error) {
        // Already recorded on the render; the log is for whoever runs dev.
        console.error(
          `[photoreal] render ${started.renderId} failed:`,
          error instanceof Error ? error.message : error
        )
      }
    })
    return Response.json(
      {
        renderId: started.renderId,
        model: started.model,
        layoutRevision: started.layoutRevision,
      },
      { status: 202 }
    )
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * GET /api/layouts/[layoutId]/plan.svg[?highlight=a,b][&theme=dark] — the
 * plan as SVG in the app's palette.
 */
export async function planSvgRoute(
  deps: Pick<PipelineDeps, "api">,
  layoutId: string,
  url: URL
): Promise<Response> {
  try {
    const layout = await deps.api.layouts.get({
      layoutId: layoutId as Id<"layouts">,
    })
    if (!layout) throw notFound(`There's no layout with id ${layoutId}.`)
    const room = await deps.api.rooms.get({ roomId: layout.roomId })
    if (!room) throw notFound(`Layout ${layoutId}'s room is missing.`)
    const highlight = (url.searchParams.get("highlight") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light"
    const svg = planSvgFor({ room, layout, highlight, theme })
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export const zPreviewsBody = z.object({
  views: z.array(zAssetPreviewView).min(1).max(4).optional(),
})

/** POST /api/assets/[assetId]/previews — re-render and store previews. */
export async function assetPreviewsRoute(
  deps: Pick<PipelineDeps, "api" | "renderer">,
  assetId: string,
  request: Request
): Promise<Response> {
  try {
    const { views } = await readBody(request, zPreviewsBody)
    const asset = await deps.api.assets.get({
      assetId: assetId as Id<"assets">,
    })
    if (!asset) throw notFound(`There's no asset with id ${assetId}.`)
    const images = await renderAndStoreAssetPreviews(
      deps,
      {
        assetId: asset._id,
        spec: zAssetSpec.parse(asset),
        previews: asset.previews,
      },
      views
    )
    return Response.json({ views: images.map((image) => image.view) })
  } catch (error) {
    return errorResponse(error)
  }
}
