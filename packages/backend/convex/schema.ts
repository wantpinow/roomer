import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

/**
 * Roomer's Convex schema.
 *
 * Domain shapes are defined once, as zod schemas in `@roomer/core`, and the
 * table validators are derived from them with `zodToConvex` (see
 * docs/2026-10-11-v1-architecture.md §2). Every field carries a comment
 * saying why it exists; every index is named `by_<field>`.
 *
 * When you add a table, also add it to `RESETTABLE_TABLES` in e2e.ts — the
 * typecheck fails until you do.
 */
export default defineSchema({
  // Placeholder so the deployment has a schema to push and `health.ping` has
  // something to read. Real tables (rooms, assets, layouts, …) replace it.
  healthchecks: defineTable({
    // Free text written by whoever recorded the check (the e2e trapdoor).
    note: v.string(),
  }),
})
