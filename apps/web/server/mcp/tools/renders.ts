import {
  DEFAULT_PHOTOREAL_MODEL,
  zPhotorealModel,
  zRenderQuality,
  zRenderSize,
} from "@roomer/core/schema"
import { z } from "zod"

import {
  DEFAULT_PHOTOREAL_QUALITY,
  DEFAULT_PHOTOREAL_SIZE,
  startPhotoreal,
  type PhotorealOutcome,
} from "../../pipelines/photoreal"
import { zViewCamera } from "../../pipelines/views"
import { duration, renderList } from "../format"
import { loadLayout } from "../lookup"
import { toolResult } from "../result"
import { zLayoutId } from "../schemas"
import { defineTool, READ_ONLY, WRITES, type RoomerTool } from "../tool"

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction < 0.01 ? 1 : 0)}%`
}

const SKIP_REASONS: Record<string, string> = {
  "not-visible": "not visible",
  "too-small": "too small in frame",
  "no-image": "no product photo",
  "over-limit": "over the model's image limit",
  "load-failed": "photo failed to load",
}

export function photorealText(
  outcome: PhotorealOutcome,
  size: { width: number; height: number }
): string {
  const lines = [
    `Photoreal render ${outcome.renderId} done in ${duration(outcome.durationMs)} (model ${outcome.model}, ${outcome.quality} quality, ${size.width}×${size.height} requested; image model ${duration(outcome.modelDurationMs)}). Layout revision ${outcome.layoutRevision}.`,
  ]
  if (outcome.references.length > 0) {
    lines.push(
      `Product photos sent: ${outcome.references.map((r) => `${r.assetName} (${r.placementIds.join(", ")}; ${percent(r.visibleFraction)} of frame)`).join("; ")}.`
    )
  } else {
    lines.push(
      "No product photos were sent (add them with add_asset_images for closer matches)."
    )
  }
  if (outcome.skipped.length > 0) {
    lines.push(
      `Skipped: ${outcome.skipped.map((s) => `${s.assetName} (${SKIP_REASONS[s.reason] ?? s.reason}${s.detail ? `: ${s.detail}` : ""})`).join("; ")}.`
    )
  }
  const { sent, failed } = outcome.roomPhotos
  if (sent > 0 || failed > 0) {
    lines.push(
      `Room photos sent: ${sent}${failed > 0 ? ` (${failed} failed to load)` : ""}.`
    )
  }
  if (outcome.outputUrl) lines.push(`Stored at ${outcome.outputUrl}`)
  if (outcome.model === "stub") {
    lines.push(
      "This is the free stub renderer (a tinted clay pass), not a real photo."
    )
  }
  return lines.join("\n")
}

export const renderPhotoreal = defineTool({
  name: "render_photoreal",
  title: "Photoreal render",
  description: `Render a layout photorealistically: clay + id passes from a camera are sent with the items' product photos to an image model, and the result is stored as a render of the current revision. Waits for the image — typically 30–120s. camera: a saved camera id or an inline { position, target, fov, projection? } (not "top"/"orbit"); frame it with render_view first. model defaults to ${DEFAULT_PHOTOREAL_MODEL} (precise); openai/gpt-image-2.5-flare is faster; "stub" is free and instant (a tinted clay pass, for testing the flow). quality defaults to ${DEFAULT_PHOTOREAL_QUALITY} — use "low" for quick looks; real renders cost money, so render only what the human wants to see.`,
  inputSchema: z.object({
    layoutId: zLayoutId,
    camera: zViewCamera.describe(
      "A saved camera id (list_cameras) or an inline { position, target, fov, projection? } in room mm"
    ),
    model: zPhotorealModel.optional(),
    quality: zRenderQuality.optional(),
    size: zRenderSize
      .optional()
      .describe(
        `Output size in px; default ${DEFAULT_PHOTOREAL_SIZE.width}×${DEFAULT_PHOTOREAL_SIZE.height}`
      ),
    extraPrompt: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .describe(
        "Extra direction for the image model, e.g. 'late afternoon light'"
      ),
  }),
  annotations: { ...WRITES, openWorldHint: true },
  async handler(args, deps) {
    const size = args.size ?? DEFAULT_PHOTOREAL_SIZE
    const started = await startPhotoreal(deps, {
      layoutId: args.layoutId,
      camera: args.camera,
      size,
      ...(args.model ? { model: args.model } : {}),
      ...(args.quality ? { quality: args.quality } : {}),
      ...(args.extraPrompt ? { extraPrompt: args.extraPrompt } : {}),
    })
    const outcome = await started.finished
    return toolResult({
      text: photorealText(outcome, size),
      structured: {
        renderId: outcome.renderId,
        model: outcome.model,
        quality: outcome.quality,
        durationMs: outcome.durationMs,
        layoutRevision: outcome.layoutRevision,
        outputUrl: outcome.outputUrl,
        references: outcome.references,
        skipped: outcome.skipped,
      },
      images: [outcome.png],
    })
  },
})

export const listRenders = defineTool({
  name: "list_renders",
  title: "List renders",
  description:
    "A layout's render history, newest first: render id, kind, model and quality, status (or why it failed), camera, the layout revision it shows (flagged when the layout has changed since), duration and image URL.",
  inputSchema: z.object({
    layoutId: zLayoutId,
    limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
  }),
  annotations: READ_ONLY,
  async handler({ layoutId, limit }, { api }) {
    const [layout, renders] = await Promise.all([
      loadLayout(api, layoutId),
      api.renders.listByLayout({ layoutId, limit: limit ?? 20 }),
    ])
    return toolResult({
      text: `Layout "${layout.name}" (revision ${layout.revision}).\n${renderList(renders, layout.revision)}`,
      structured: {
        renders: renders.map((r) => ({
          _id: r._id,
          kind: r.kind,
          status: r.status,
          model: r.model,
          quality: r.quality,
          camera: r.view.id,
          layoutRevision: r.layoutRevision,
          durationMs: r.durationMs,
          error: r.error,
          outputUrl: r.outputUrl,
          createdAt: r.createdAt,
        })),
      },
    })
  },
})

export const renderTools: RoomerTool[] = [renderPhotoreal, listRenders]
