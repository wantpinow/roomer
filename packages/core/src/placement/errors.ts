import type { LayoutOp } from "../schema"

// Errors carry a stable `code` for programs and a message written for the
// agent: it names the wall/corner/feature/placement and says what exists.

export type PlacementErrorCode =
  | "UNKNOWN_WALL"
  | "UNKNOWN_CORNER"
  | "UNKNOWN_FEATURE"
  | "UNKNOWN_PLACEMENT"
  | "AT_OUT_OF_RANGE"
  | "WALL_FEATURE_TARGET"
  | "AMBIGUOUS_TARGET"
  | "MISSING_TARGET"
  | "SELF_TARGET"
  | "REFLEX_CORNER"
  | "NEEDS_ON_WALL"
  | "TOO_TALL"

export class PlacementError extends Error {
  readonly code: PlacementErrorCode

  constructor(code: PlacementErrorCode, message: string) {
    super(message)
    this.name = "PlacementError"
    this.code = code
  }
}

export type OpErrorCode =
  | PlacementErrorCode
  | "UNKNOWN_ASSET"
  | "DUPLICATE_ID"
  | "NOTHING_TO_SET"
  | "BELOW_FLOOR"

/** A layout op that couldn't be applied; `index` points into the ops list. */
export class OpError extends Error {
  readonly code: OpErrorCode
  readonly index: number
  readonly op: LayoutOp["op"]
  /** The message without the `ops[i] (op):` prefix. */
  readonly detail: string

  constructor(
    index: number,
    op: LayoutOp["op"],
    code: OpErrorCode,
    detail: string
  ) {
    super(`ops[${index}] (${op}): ${detail}`)
    this.name = "OpError"
    this.code = code
    this.index = index
    this.op = op
    this.detail = detail
  }
}

/** "W1–W6" style range for listing what exists. */
export function idRange(prefix: string, count: number): string {
  return count === 1 ? `${prefix}1` : `${prefix}1–${prefix}${count}`
}

/** "sofa, coffee-table" — or a note that there are none. */
export function listIds(ids: readonly string[], none: string): string {
  return ids.length === 0 ? none : ids.join(", ")
}
