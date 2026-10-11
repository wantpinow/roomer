import { ConvexError } from "convex/values"

/**
 * What to show a person when a Convex call is refused. A `ConvexError` with a
 * string payload is a sentence the backend wrote for them; anything else is a
 * fault whose message — a request id, a stack frame, or "Server Error" —
 * means nothing to them, so it becomes the fallback. (From masterguest.)
 */
export function errorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (err instanceof ConvexError && typeof err.data === "string") {
    return err.data
  }
  return fallback
}
