/**
 * The only builders public Convex functions may use.
 *
 * Every public query, mutation and action goes through `appQuery`,
 * `appMutation` or `appAction`; importing the raw builders from
 * `./_generated/server` is lint-banned outside an explicit exemption list
 * (see packages/backend/eslint.config.js). v1 has a single local user and no
 * auth, so the wrappers are no-ops today — but when auth arrives it is a
 * change here, in one place, rather than in every function.
 *
 * Internal functions (`internalQuery`, …) are not wrapped: they are never
 * reachable from a client.
 */
import {
  customAction,
  customMutation,
  customQuery,
  NoOp,
} from "convex-helpers/server/customFunctions"

import { action, mutation, query } from "./_generated/server"
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server"

// Re-export context types so helper functions can import them without
// touching _generated/server directly.
export type { QueryCtx, MutationCtx, ActionCtx }

// Auth goes here later: swap `NoOp` for an input that resolves the caller
// (and throws `ConvexError("Unauthenticated")`) and adds them to ctx.
export const appQuery = customQuery(query, NoOp)
export const appMutation = customMutation(mutation, NoOp)
export const appAction = customAction(action, NoOp)
