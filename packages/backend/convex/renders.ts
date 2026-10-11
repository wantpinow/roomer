/**
 * Render records: clay and id passes and photoreal images of a layout from
 * a camera. A record is created `pending` with a copy of the layout and
 * camera at that moment (so renders stay reproducible and comparable after
 * the layout moves on), then completed with its image or failed with why.
 */
import { zCamera } from "@roomer/core/schema"
import { v, type Infer } from "convex/values"
import { z } from "zod"

import type { Doc, Id } from "./_generated/dataModel"
import { conflict, invalidInput, notFound, parseInput } from "./errors"
import {
  appMutation,
  appQuery,
  type MutationCtx,
  type QueryCtx,
} from "./functions"
import { getLayoutOrThrow } from "./layouts"
import {
  vCamera,
  vPhotorealModel,
  vRenderInput,
  vRenderKind,
  vRenderQuality,
  zRenderInput,
} from "./validators"

/** Max renders one listing returns. */
export const MAX_RENDERS = 100
/** Stored failure messages are cut to this many characters. */
export const MAX_ERROR_LENGTH = 2000
/** Max images sent with one render (gpt-image's input limit). */
export const MAX_RENDER_INPUTS = 16

const zRenderInputs = z.array(zRenderInput).max(MAX_RENDER_INPUTS)

// ---------------------------------------------------------------------------
// Helpers (thin-handler pattern — all logic lives here)
// ---------------------------------------------------------------------------

export async function getRenderOrThrow(
  ctx: QueryCtx,
  renderId: Id<"renders">
): Promise<Doc<"renders">> {
  const render = await ctx.db.get(renderId)
  if (!render) throw notFound(`There's no render with id ${renderId}.`)
  return render
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

/** A render with URLs for its image and inputs. */
async function withUrls(ctx: QueryCtx, render: Doc<"renders">) {
  return {
    ...render,
    outputUrl: render.output ? await ctx.storage.getUrl(render.output) : null,
    inputUrls: await Promise.all(
      render.inputs.map(async (input) => ({
        ...input,
        url: await ctx.storage.getUrl(input.storageId),
      }))
    ),
  }
}

export type CreateRenderArgs = {
  layoutId: Id<"layouts">
  kind: Doc<"renders">["kind"]
  view: Infer<typeof vCamera>
  model?: Doc<"renders">["model"]
  quality?: Doc<"renders">["quality"]
  prompt?: string
  inputs?: Infer<typeof vRenderInput>[]
}

export async function doCreateRender(
  ctx: MutationCtx,
  args: CreateRenderArgs
): Promise<{ renderId: Id<"renders">; layoutRevision: number }> {
  const view = parseInput(zCamera, args.view, "camera", ["view"])
  const inputs = parseInput(zRenderInputs, args.inputs ?? [], "inputs", [
    "inputs",
  ])
  if (
    args.kind !== "photoreal" &&
    (args.model !== undefined || args.quality !== undefined)
  ) {
    throw invalidInput(
      `model and quality only apply to photoreal renders, not ${args.kind} passes.`
    )
  }
  await assertStoredFiles(
    ctx,
    inputs.map((input) => input.storageId)
  )
  const layout = await getLayoutOrThrow(ctx, args.layoutId)
  const renderId = await ctx.db.insert("renders", {
    layoutId: layout._id,
    roomId: layout.roomId,
    kind: args.kind,
    status: "pending",
    view,
    ...(args.model !== undefined ? { model: args.model } : {}),
    ...(args.quality !== undefined ? { quality: args.quality } : {}),
    ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
    inputs,
    layoutRevision: layout.revision,
    layoutSnapshot: {
      placements: layout.placements,
      ...(layout.finishes ? { finishes: layout.finishes } : {}),
    },
    createdAt: Date.now(),
  })
  return { renderId, layoutRevision: layout.revision }
}

function assertPending(render: Doc<"renders">): void {
  if (render.status !== "pending") {
    throw conflict(
      `Render ${render._id} already ${render.status === "done" ? "finished" : "failed"}; start a new render instead.`
    )
  }
}

export async function doCompleteRender(
  ctx: MutationCtx,
  args: {
    renderId: Id<"renders">
    output: Id<"_storage">
    inputs?: Infer<typeof vRenderInput>[]
    prompt?: string
    durationMs?: number
  }
): Promise<void> {
  const render = await getRenderOrThrow(ctx, args.renderId)
  assertPending(render)
  const inputs =
    args.inputs === undefined
      ? undefined
      : parseInput(zRenderInputs, args.inputs, "inputs", ["inputs"])
  await assertStoredFiles(ctx, [
    args.output,
    ...(inputs ?? []).map((input) => input.storageId),
  ])
  const completedAt = Date.now()
  await ctx.db.patch(render._id, {
    status: "done",
    output: args.output,
    ...(inputs !== undefined ? { inputs } : {}),
    ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
    durationMs: args.durationMs ?? completedAt - render.createdAt,
    completedAt,
  })
}

export async function doFailRender(
  ctx: MutationCtx,
  args: { renderId: Id<"renders">; error: string; durationMs?: number }
): Promise<void> {
  const render = await getRenderOrThrow(ctx, args.renderId)
  assertPending(render)
  // Errors can carry whole stack traces; keep the start, which says what.
  const error = args.error.trim().slice(0, MAX_ERROR_LENGTH) || "Unknown error"
  const completedAt = Date.now()
  await ctx.db.patch(render._id, {
    status: "failed",
    error,
    durationMs: args.durationMs ?? completedAt - render.createdAt,
    completedAt,
  })
}

export async function doListRendersByLayout(
  ctx: QueryCtx,
  args: { layoutId: Id<"layouts">; limit?: number }
) {
  const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), MAX_RENDERS)
  const renders = await ctx.db
    .query("renders")
    .withIndex("by_layout", (q) => q.eq("layoutId", args.layoutId))
    .order("desc")
    .take(limit)
  return await Promise.all(renders.map((render) => withUrls(ctx, render)))
}

export async function doListRendersByRoom(
  ctx: QueryCtx,
  args: { roomId: Id<"rooms">; limit?: number }
) {
  const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), MAX_RENDERS)
  const renders = await ctx.db
    .query("renders")
    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
    .order("desc")
    .take(limit)
  return await Promise.all(renders.map((render) => withUrls(ctx, render)))
}

export async function doGetRender(
  ctx: QueryCtx,
  args: { renderId: Id<"renders"> }
) {
  const render = await ctx.db.get(args.renderId)
  return render ? await withUrls(ctx, render) : null
}

// ---------------------------------------------------------------------------
// Convex function exports
// ---------------------------------------------------------------------------

export const create = appMutation({
  args: {
    layoutId: v.id("layouts"),
    kind: vRenderKind,
    view: vCamera,
    model: v.optional(vPhotorealModel),
    quality: v.optional(vRenderQuality),
    prompt: v.optional(v.string()),
    inputs: v.optional(v.array(vRenderInput)),
  },
  handler: async (ctx, args) => {
    return await doCreateRender(ctx, args)
  },
})

export const complete = appMutation({
  args: {
    renderId: v.id("renders"),
    output: v.id("_storage"),
    inputs: v.optional(v.array(vRenderInput)),
    prompt: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await doCompleteRender(ctx, args)
  },
})

export const fail = appMutation({
  args: {
    renderId: v.id("renders"),
    error: v.string(),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await doFailRender(ctx, args)
  },
})

export const listByLayout = appQuery({
  args: { layoutId: v.id("layouts"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await doListRendersByLayout(ctx, args)
  },
})

export const listByRoom = appQuery({
  args: { roomId: v.id("rooms"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await doListRendersByRoom(ctx, args)
  },
})

export const get = appQuery({
  args: { renderId: v.id("renders") },
  handler: async (ctx, args) => {
    return await doGetRender(ctx, args)
  },
})
