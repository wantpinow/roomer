import type { AppErrorData } from "@roomer/backend/convex/errors"
import { OpError, PlacementError } from "@roomer/core/placement"
import { ZodError } from "zod"

import { PhotorealError } from "../photoreal/errors"
import { RoomerError } from "../pipelines/errors"
import { DownloadError } from "../pipelines/files"

import { type ToolResult, toolError } from "./result"

// Every failure a tool can hit becomes an `isError` result whose text the
// agent can act on: backend ConvexErrors keep their exact message (names,
// numbers, what to do), core placement/op errors and photoreal failures keep
// theirs, and Convex's raw validator noise is rewritten into a sentence.
// Anything unrecognised is a bug and says so.

export interface DescribedError {
  /** Stable code, e.g. INVALID_INPUT, NOT_FOUND, PHOTOREAL_TIMEOUT. */
  code: string
  /** The message for the agent, verbatim from its source where there is one. */
  message: string
  issues?: { path: string; message: string }[]
  /** For batches: the op that failed (nothing in the batch was applied). */
  opIndex?: number
}

/**
 * ConvexError, recognised by the global symbol Convex brands it with rather
 * than `instanceof`: pnpm installs convex once per peer-dependency set, and
 * Next may bundle the copy that threw separately from the one imported here.
 */
const CONVEX_ERROR = Symbol.for("ConvexError")

function isConvexError(error: unknown): error is Error & { data: unknown } {
  return (
    error instanceof Error &&
    Reflect.get(error, CONVEX_ERROR) === true &&
    "data" in error
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isAppErrorData(data: unknown): data is AppErrorData {
  return (
    isRecord(data) &&
    typeof data.code === "string" &&
    typeof data.message === "string"
  )
}

const ID_SOURCES =
  "Ids come from get_overview, list_layouts, search_assets and the other read tools."

const SINGULAR: Record<string, string> = {
  rooms: "room",
  layouts: "layout",
  assets: "asset",
  renders: "render",
  _storage: "file",
}

function singular(table: string): string {
  return SINGULAR[table] ?? table
}

function article(noun: string): string {
  return `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`
}

const REQUEST_ID_PREFIX = /^\[Request ID: [^\]]*\]\s*Server Error\s*/i
const CALLED_BY = /\s*Called by client\s*$/i

/**
 * Convex reports argument validator failures as a plain Error, e.g.
 * "ArgumentValidationError: Value does not match validator.\nPath: .layoutId
 * \nValue: \"abc\"\nValidator: v.id(\"layouts\")" or "Found ID \"…\" from table
 * `rooms`, which does not match the table name in validator
 * `v.id(\"layouts\")`.Path: .layoutId". Agents mostly hit these by passing
 * the wrong kind of id, so they get a sentence of their own.
 */
function describeConvexPlainError(message: string): DescribedError {
  const clean = message
    .replace(REQUEST_ID_PREFIX, "")
    .replace(CALLED_BY, "")
    .trim()
  if (!clean.includes("ArgumentValidationError")) {
    const first = clean.split("\n")[0]?.replace(/^Uncaught /, "") ?? ""
    return {
      code: "INTERNAL",
      message: `Roomer hit an unexpected error (likely a bug, not your input): ${first}`,
    }
  }
  const path = /Path: \.?([^\n]+)/.exec(clean)?.[1]?.trim()
  const where = path ? ` (${path})` : ""
  const expected = /v\.id\("([^"]+)"\)/.exec(clean)?.[1]
  const wrongTable = /Found ID "([^"]+)" from table `([^`]+)`/.exec(clean)
  if (expected && wrongTable) {
    return {
      code: "INVALID_INPUT",
      message: `"${wrongTable[1]}"${where} is ${article(singular(wrongTable[2] ?? ""))} id, not ${article(singular(expected))} id. ${ID_SOURCES}`,
    }
  }
  if (expected) {
    const value = /Value: ([^\n]+)/.exec(clean)?.[1]?.trim() ?? "That value"
    return {
      code: "INVALID_INPUT",
      message: `${value}${where} is not ${article(singular(expected))} id. ${ID_SOURCES}`,
    }
  }
  const detail = clean
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
  return { code: "INVALID_INPUT", message: detail }
}

/** ["ops", 0, "feature", "hinge"] → "ops[0].feature.hinge". */
export function issuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (out, part) =>
      typeof part === "number"
        ? `${out}[${part}]`
        : out
          ? `${out}.${String(part)}`
          : String(part),
    ""
  )
}

function zodIssues(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issuePath(issue.path),
    message: issue.message,
  }))
}

export function describeError(error: unknown): DescribedError {
  if (isConvexError(error)) {
    const data = error.data
    if (isAppErrorData(data)) {
      return {
        code: data.code,
        message: data.message,
        ...(data.issues?.length ? { issues: data.issues } : {}),
        ...(data.opIndex !== undefined ? { opIndex: data.opIndex } : {}),
      }
    }
    return {
      code: "INVALID_INPUT",
      message: typeof data === "string" ? data : JSON.stringify(data),
    }
  }
  if (error instanceof RoomerError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof OpError) {
    return { code: "INVALID_OP", message: error.message, opIndex: error.index }
  }
  if (error instanceof PlacementError) {
    return { code: "INVALID_OP", message: error.message }
  }
  if (error instanceof PhotorealError) {
    return { code: `PHOTOREAL_${error.code}`, message: error.message }
  }
  if (error instanceof DownloadError) {
    return { code: "DOWNLOAD_FAILED", message: error.message }
  }
  if (error instanceof ZodError) {
    const issues = zodIssues(error)
    const lines = issues.map((i) =>
      i.path ? `${i.path}: ${i.message}` : i.message
    )
    return {
      code: "INVALID_INPUT",
      message:
        lines.length === 1
          ? `Invalid input: ${lines[0]}`
          : `Invalid input (${lines.length} problems):\n${lines.map((line) => `- ${line}`).join("\n")}`,
      issues,
    }
  }
  if (error instanceof Error) return describeConvexPlainError(error.message)
  return {
    code: "INTERNAL",
    message: `Roomer hit an unexpected error: ${String(error)}`,
  }
}

/** The agent-facing text for a described error. */
export function formatError(described: DescribedError): string {
  const lines = [`Error ${described.code}: ${described.message}`]
  if (described.opIndex !== undefined || described.code === "INVALID_OP") {
    const at =
      described.opIndex === undefined
        ? ""
        : ` (it stopped at ops[${described.opIndex}])`
    lines.push(
      `Nothing in this batch was applied${at}. Fix that op and send the whole batch again.`
    )
  }
  return lines.join("\n")
}

export function errorResult(error: unknown): ToolResult {
  const described = describeError(error)
  return toolError(formatError(described), { error: described })
}
