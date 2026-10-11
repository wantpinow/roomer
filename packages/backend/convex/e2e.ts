/**
 * Test trapdoor for the Playwright end-to-end suite (apps/e2e).
 *
 * Everything here is inert unless the deployment sets `E2E_TESTING_ENABLED`,
 * which only `scripts/e2e-setup.ts` ever does — see `assertE2E` below for the
 * full guard. Specs use it to arrange state upstream of the seam they test and
 * to read server truth afterwards; the UI is driven only for the seam itself.
 *
 * The rule that makes this trustworthy: arranging state composes the real
 * `do*` helpers and never writes rows by hand, so arranged state is state the
 * app could genuinely have produced.
 *
 * Raw `mutation`/`query` builders are deliberate (this file is on the
 * exemption list in eslint.config.js): the guard is the env flag, not a
 * wrapper.
 */
import { v } from "convex/values"

import type { TableNames } from "./_generated/dataModel"
import { mutation } from "./_generated/server"
import type { MutationCtx } from "./functions"
import { doRecordHealthcheck } from "./health"
import { doSeed, vSeedResult } from "./seed"

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/** Loopback only: the e2e backend always runs on this machine. */
const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/

/**
 * Two gates, both of which must pass, and both of which fail CLOSED:
 *
 *  1. `E2E_TESTING_ENABLED === "true"`, set by `scripts/e2e-setup.ts` and
 *     nowhere else.
 *  2. The deployment is on loopback (`CONVEX_CLOUD_URL`, which Convex sets
 *     itself). An allowlist, not a denylist: an unset variable fails it.
 */
export function assertE2E() {
  if (process.env.E2E_TESTING_ENABLED !== "true") {
    throw new Error(
      "The e2e trapdoor is disabled on this deployment (E2E_TESTING_ENABLED is not set)."
    )
  }
  const cloudUrl = process.env.CONVEX_CLOUD_URL ?? ""
  if (!LOOPBACK.test(cloudUrl)) {
    throw new Error(
      `The e2e trapdoor only runs on a local deployment (got ${cloudUrl || "no CONVEX_CLOUD_URL"}).`
    )
  }
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/**
 * Every application table, in the order `reset` clears them. When you add a
 * table to schema.ts, add it here — the assertion below fails typecheck until
 * you do, so a reset can never silently leave rows behind.
 */
export const RESETTABLE_TABLES = [
  "healthchecks",
  "renders",
  "layoutEvents",
  "layoutAssetRefs",
  "layouts",
  "assets",
  "rooms",
] as const satisfies readonly TableNames[]

type UnlistedTable = Exclude<TableNames, (typeof RESETTABLE_TABLES)[number]>
const _everyTableIsResettable: [UnlistedTable] extends [never] ? true : never =
  true
void _everyTableIsResettable

/**
 * Delete every row of every application table. The e2e database is small and
 * disposable, so one transaction is plenty; if a spec ever creates thousands
 * of rows, page this like masterguest's `seed.clearTable`.
 */
export async function doReset(ctx: MutationCtx) {
  const deleted: Record<string, number> = {}
  for (const table of RESETTABLE_TABLES) {
    let count = 0
    for await (const doc of ctx.db.query(table)) {
      await ctx.db.delete(doc._id)
      count++
    }
    deleted[table] = count
  }
  return deleted
}

// ---------------------------------------------------------------------------
// Convex function exports
// ---------------------------------------------------------------------------

export const reset = mutation({
  args: {},
  returns: v.record(v.string(), v.float64()),
  handler: async (ctx) => {
    assertE2E()
    return await doReset(ctx)
  },
})

export const recordHealthcheck = mutation({
  args: { note: v.string() },
  returns: v.id("healthchecks"),
  handler: async (ctx, args) => {
    assertE2E()
    return await doRecordHealthcheck(ctx, args)
  },
})

/**
 * The living room, the generic library and the "Starter" layout (the same
 * data `pnpm seed` creates), returning their ids. Idempotent, so specs can
 * call it after `reset` or on top of existing data.
 */
export const seedLivingRoom = mutation({
  args: {},
  returns: vSeedResult,
  handler: async (ctx) => {
    assertE2E()
    return await doSeed(ctx)
  },
})
