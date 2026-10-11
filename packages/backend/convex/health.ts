/**
 * Liveness check for the whole stack: the web app's home page subscribes to
 * `health.ping`, so seeing "pong" proves Next → Convex client → deployment →
 * schema are all wired.
 */
import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import { appQuery, type MutationCtx, type QueryCtx } from "./functions"

// ---------------------------------------------------------------------------
// Helpers (thin-handler pattern — all logic lives here)
// ---------------------------------------------------------------------------

export const vPingResult = v.object({
  message: v.literal("pong"),
  // The newest healthcheck's note, so a ping also proves the database is
  // readable and that the page updates live when a row lands.
  latestNote: v.union(v.string(), v.null()),
})

export async function doPing(ctx: QueryCtx) {
  const latest = await ctx.db.query("healthchecks").order("desc").first()
  return { message: "pong" as const, latestNote: latest?.note ?? null }
}

export async function doRecordHealthcheck(
  ctx: MutationCtx,
  args: { note: string }
): Promise<Id<"healthchecks">> {
  return await ctx.db.insert("healthchecks", { note: args.note })
}

// ---------------------------------------------------------------------------
// Convex function exports
// ---------------------------------------------------------------------------

export const ping = appQuery({
  args: {},
  returns: vPingResult,
  handler: async (ctx) => {
    return await doPing(ctx)
  },
})
