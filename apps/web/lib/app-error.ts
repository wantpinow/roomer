import { ConvexError } from "convex/values"

// The backend's user-facing errors are ConvexErrors carrying
// `{ code, message, issues?, opIndex? }` (packages/backend/convex/errors.ts).
// The UI branches on the code (CONFLICT → refetch and say so) and shows the
// message, which is written to be read.

export const APP_ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_OP",
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

export interface AppError {
  code: AppErrorCode
  message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isAppErrorCode(value: unknown): value is AppErrorCode {
  return APP_ERROR_CODES.some((code) => code === value)
}

/** The structured error inside a Convex failure, or null for anything else. */
export function appErrorOf(error: unknown): AppError | null {
  if (!(error instanceof ConvexError)) return null
  const data: unknown = error.data
  if (!isRecord(data)) return null
  const { code, message } = data
  if (!isAppErrorCode(code) || typeof message !== "string") return null
  return { code, message }
}

/** A sentence for a toast: the backend's message, or a calm fallback. */
export function describeError(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const app = appErrorOf(error)
  if (app) return app.message
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data
  }
  return fallback
}
