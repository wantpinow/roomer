/**
 * File uploads. Clients (the web UI, the MCP server's render pipeline) POST
 * a file to the URL from `generateUploadUrl`, get a storage id back, and
 * pass that id to the mutation that attaches it (asset photos, previews,
 * room photos, render outputs).
 */
import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import {
  appMutation,
  appQuery,
  type MutationCtx,
  type QueryCtx,
} from "./functions"

// ---------------------------------------------------------------------------
// Helpers (thin-handler pattern — all logic lives here)
// ---------------------------------------------------------------------------

export async function doGenerateUploadUrl(ctx: MutationCtx): Promise<string> {
  return await ctx.storage.generateUploadUrl()
}

/** A servable URL for a stored file, or null if it doesn't exist. */
export async function doGetFileUrl(
  ctx: QueryCtx,
  args: { storageId: Id<"_storage"> }
): Promise<string | null> {
  return await ctx.storage.getUrl(args.storageId)
}

// ---------------------------------------------------------------------------
// Convex function exports
// ---------------------------------------------------------------------------

export const generateUploadUrl = appMutation({
  args: {},
  handler: async (ctx) => {
    return await doGenerateUploadUrl(ctx)
  },
})

export const getUrl = appQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await doGetFileUrl(ctx, args)
  },
})
