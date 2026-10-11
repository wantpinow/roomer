/**
 * A tiny typed client for the e2e backend: the trapdoor
 * (packages/backend/convex/e2e.ts) plus the public API.
 *
 * Specs use it for two things: arranging state upstream of the seam they are
 * testing (reset, seed, an "agent" edit landing while the page is open), and
 * asserting on server truth afterwards. Built on `ConvexHttpClient`, so every
 * call is typed by the generated `api` — a renamed function or a wrong
 * argument fails typecheck.
 */
import { ConvexHttpClient } from "convex/browser"
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server"

// `.js` because Playwright loads fixtures through Node's ESM resolver, which
// (unlike the bundlers web uses) wants the file extension for a runtime import.
import { api } from "@roomer/backend/convex/_generated/api.js"

export { api }

export const CONVEX_URL = process.env.E2E_CONVEX_URL ?? "http://127.0.0.1:3220"

// `logger: false`: specs assert on thrown errors themselves; the client's
// own console echo of server logs is noise in the reporter.
const client = new ConvexHttpClient(CONVEX_URL, { logger: false })

export type SeedResult = FunctionReturnType<typeof api.e2e.seedLivingRoom>

export const convex = {
  /** Delete every row of every table. Returns per-table counts. */
  reset: (): Promise<Record<string, number>> =>
    client.mutation(api.e2e.reset, {}),

  /**
   * The living room, the generic library and the "Starter" layout (sofa,
   * coffee table, rug) — what `pnpm seed` creates — with their ids.
   */
  seedLivingRoom: (): Promise<SeedResult> =>
    client.mutation(api.e2e.seedLivingRoom, {}),

  /** The public ping query: proves the deployment answers. */
  ping: () => client.query(api.health.ping, {}),

  /** Any public query, e.g. `convex.query(api.layouts.get, { layoutId })`. */
  query: <Query extends FunctionReference<"query">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>> => client.query(query, ...args),

  /** Any public mutation — how a spec plays the agent or a second tab. */
  mutation: <Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>> =>
    client.mutation(mutation, ...args),
}

/** `reset` then `seedLivingRoom`: the clean slate most specs start from. */
export async function resetAndSeed(): Promise<SeedResult> {
  await convex.reset()
  return await convex.seedLivingRoom()
}
