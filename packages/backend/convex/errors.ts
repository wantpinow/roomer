/**
 * Errors a person or the agent should read.
 *
 * Every user-facing failure is a `ConvexError` carrying `AppErrorData`: a
 * stable `code` for programs (the MCP server maps it to a tool error), a
 * `message` written for the agent (names, numbers, what to do), and for
 * validation failures the individual `issues`. Invariant violations — things
 * that can only happen through a bug — stay plain `Error`s.
 */
import { ConvexError } from "convex/values"
import type { z } from "zod"

export const APP_ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_OP",
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

export type ErrorIssue = {
  /** Where in the input, e.g. `features[2].offset`; "" for the whole input. */
  path: string
  message: string
}

export type AppErrorData = {
  code: AppErrorCode
  message: string
  issues?: ErrorIssue[]
  /** For batch operations: the index of the op that failed. */
  opIndex?: number
}

export function appError(data: AppErrorData): ConvexError<AppErrorData> {
  return new ConvexError(data)
}

/** INVALID_INPUT listing every problem; the message includes them all. */
export function invalidInput(
  summary: string,
  issues: readonly ErrorIssue[] = []
): ConvexError<AppErrorData> {
  const details = issues
    .map((issue) =>
      issue.path ? `${issue.path}: ${issue.message}` : issue.message
    )
    .join(" ")
  return appError({
    code: "INVALID_INPUT",
    message: details ? `${summary} ${details}` : summary,
    ...(issues.length > 0 ? { issues: [...issues] } : {}),
  })
}

export function notFound(message: string): ConvexError<AppErrorData> {
  return appError({ code: "NOT_FOUND", message })
}

export function conflict(message: string): ConvexError<AppErrorData> {
  return appError({ code: "CONFLICT", message })
}

/** Plain sentences (from core validators) as issues at one path. */
export function issuesAt(
  path: string,
  messages: readonly string[]
): ErrorIssue[] {
  return messages.map((message) => ({ path, message }))
}

/** `["features", 2, "offset"]` → `features[2].offset`. */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, part) => {
    if (typeof part === "number") return `${out}[${part}]`
    const key = String(part)
    return out ? `${out}.${key}` : key
  }, "")
}

/**
 * Semantic validation with zod (integer mm, ranges, regexes — what Convex's
 * structural validators can't express). Throws INVALID_INPUT with one issue
 * per zod issue, paths prefixed with `prefix`.
 */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  what: string,
  prefix: readonly PropertyKey[] = []
): z.output<Schema> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw invalidInput(
    `Invalid ${what}.`,
    result.error.issues.map((issue) => ({
      path: formatIssuePath([...prefix, ...issue.path]),
      message: issue.message,
    }))
  )
}
