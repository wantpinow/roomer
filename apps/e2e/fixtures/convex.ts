/**
 * A tiny typed client for the e2e trapdoor (packages/backend/convex/e2e.ts).
 *
 * Specs use it for two things: arranging state upstream of the seam they are
 * testing, and asserting on server truth afterwards. Built on
 * `ConvexHttpClient`, so every call is typed by the generated `api` — a
 * renamed trapdoor function or a wrong argument fails typecheck.
 */
import { ConvexHttpClient } from "convex/browser"

// `.js` because Playwright loads fixtures through Node's ESM resolver, which
// (unlike the bundlers web uses) wants the file extension for a runtime import.
import { api } from "@roomer/backend/convex/_generated/api.js"
import type { Id } from "@roomer/backend/convex/_generated/dataModel"

export const CONVEX_URL = process.env.E2E_CONVEX_URL ?? "http://127.0.0.1:3220"

const client = new ConvexHttpClient(CONVEX_URL)

export const convex = {
  /** Delete every row of every table. Returns per-table counts. */
  reset: (): Promise<Record<string, number>> =>
    client.mutation(api.e2e.reset, {}),

  /** Insert a healthcheck row (what `health.ping` reports as latestNote). */
  recordHealthcheck: (note: string): Promise<Id<"healthchecks">> =>
    client.mutation(api.e2e.recordHealthcheck, { note }),

  /** The public ping query, read over HTTP — server truth for the UI. */
  ping: () => client.query(api.health.ping, {}),
}
