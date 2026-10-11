"use client"

import { useQueries } from "convex-helpers/react/cache"
import type { OptionalRestArgsOrSkip } from "convex/react"
import type { FunctionReference, FunctionReturnType } from "convex/server"

export type SafeQueryResult<Query extends FunctionReference<"query">> =
  | { status: "loading"; data: undefined; error: undefined }
  | { status: "error"; data: undefined; error: Error }
  | { status: "ready"; data: FunctionReturnType<Query>; error: undefined }

/**
 * `useQuery` that reports failures instead of throwing them into the render
 * (e.g. a malformed id in the URL), via the cached `useQueries`.
 */
export function useSafeQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): SafeQueryResult<Query> {
  const [first] = args
  const skip = first === "skip"
  const results = useQueries(
    skip ? {} : { result: { query, args: first ?? {} } }
  )
  const value: unknown = results.result
  if (value === undefined) {
    return { status: "loading", data: undefined, error: undefined }
  }
  if (value instanceof Error) {
    return { status: "error", data: undefined, error: value }
  }
  // useQueries is untyped; this is exactly the query's return value.
  const data = value as FunctionReturnType<Query>
  return { status: "ready", data, error: undefined }
}
