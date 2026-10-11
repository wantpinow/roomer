import { OpError, PlacementError } from "@roomer/core/placement"
import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { PhotorealError } from "../../photoreal/errors"
import { notFound } from "../../pipelines/errors"
import { DownloadError } from "../../pipelines/files"
import { describeError, errorResult, formatError } from "../errors"

import { textOf } from "./fakes"

describe("describeError", () => {
  it("keeps a backend ConvexError's code, exact message, issues and op index", () => {
    const data = {
      code: "INVALID_OP",
      message:
        "ops[0] (remove): no placement with id 'nope'. Existing ids: sofa, coffee-table, rug.",
      issues: [{ path: "ops[0]", message: "no placement with id 'nope'." }],
      opIndex: 0,
    }
    expect(describeError(new ConvexError(data))).toEqual(data)
  })

  it("recognises a ConvexError thrown by another copy of the convex package", () => {
    const foreign = Object.assign(new Error("Uncaught ConvexError: {}"), {
      name: "ConvexError",
      data: { code: "NOT_FOUND", message: "There's no layout with id x." },
      [Symbol.for("ConvexError")]: true,
    })
    expect(describeError(foreign)).toEqual({
      code: "NOT_FOUND",
      message: "There's no layout with id x.",
    })
  })

  it("drops an empty issues list", () => {
    expect(
      describeError(
        new ConvexError({ code: "NOT_FOUND", message: "Gone.", issues: [] })
      )
    ).toEqual({ code: "NOT_FOUND", message: "Gone." })
  })

  it("passes a string ConvexError through", () => {
    expect(describeError(new ConvexError("Nope."))).toEqual({
      code: "INVALID_INPUT",
      message: "Nope.",
    })
  })

  it("turns a malformed-id validator error into a sentence", () => {
    const error = new Error(
      '[Request ID: 6e97ec6f8060af3c] Server Error\nArgumentValidationError: Value does not match validator.\nPath: .layoutId\nValue: "abc"\nValidator: v.id("layouts")\n\n'
    )
    expect(describeError(error)).toEqual({
      code: "INVALID_INPUT",
      message:
        '"abc" (layoutId) is not a layout id. Ids come from get_overview, list_layouts, search_assets and the other read tools.',
    })
  })

  it("names the table of an id passed for the wrong kind", () => {
    const error = new Error(
      '[Request ID: 877fa97f9ae89125] Server Error\nArgumentValidationError: Found ID "jx73" from table `rooms`, which does not match the table name in validator `v.id("layouts")`.Path: .layoutId\n\n'
    )
    expect(describeError(error).message).toMatch(
      /^"jx73" \(layoutId\) is a room id, not a layout id\./
    )
  })

  it("flattens other validator errors to one line", () => {
    const error = new Error(
      "[Request ID: 1] Server Error\nArgumentValidationError: Object is missing the required field `name`.\nPath: .\n"
    )
    expect(describeError(error)).toEqual({
      code: "INVALID_INPUT",
      message:
        "ArgumentValidationError: Object is missing the required field `name`. Path: .",
    })
  })

  it("reports unexpected server errors as internal, first line only", () => {
    const error = new Error(
      "[Request ID: 2] Server Error\nUncaught Error: applyOps returned junk\n    at doApplyChanges (layouts.ts:1)"
    )
    expect(describeError(error)).toEqual({
      code: "INTERNAL",
      message:
        "Roomer hit an unexpected error (likely a bug, not your input): Error: applyOps returned junk",
    })
  })

  it("maps core, photoreal, download, lookup and zod errors", () => {
    expect(
      describeError(new OpError(2, "add", "UNKNOWN_ASSET", "no asset 'x'"))
    ).toEqual({
      code: "INVALID_OP",
      message: "ops[2] (add): no asset 'x'",
      opIndex: 2,
    })
    expect(
      describeError(new PlacementError("UNKNOWN_WALL", "No wall W9."))
    ).toEqual({
      code: "INVALID_OP",
      message: "No wall W9.",
    })
    expect(
      describeError(new PhotorealError("RATE_LIMIT", "Slow down.")).code
    ).toBe("PHOTOREAL_RATE_LIMIT")
    expect(
      describeError(new DownloadError("https://x.test/a.jpg", "HTTP 403."))
        .message
    ).toBe("Couldn't download https://x.test/a.jpg: HTTP 403.")
    expect(describeError(notFound("No camera."))).toEqual({
      code: "NOT_FOUND",
      message: "No camera.",
    })
    const zodError = z.object({ a: z.number() }).safeParse({ a: "x" }).error
    const described = describeError(zodError)
    expect(described.code).toBe("INVALID_INPUT")
    expect(described.message).toMatch(/^Invalid input: a: /)
    expect(described.issues?.[0]?.path).toBe("a")
    expect(describeError("boom").code).toBe("INTERNAL")
  })

  it("names zod fields like ops[0].feature.hinge and lists several one per line", () => {
    const schema = z.object({
      ops: z.array(z.object({ id: z.string(), at: z.number() })),
    })
    const error = schema.safeParse({
      ops: [{ id: "a", at: 1 }, { id: 2 }],
    }).error
    const described = describeError(error)
    expect(described.issues?.map((i) => i.path)).toEqual([
      "ops[1].id",
      "ops[1].at",
    ])
    expect(described.message).toBe(
      [
        "Invalid input (2 problems):",
        "- ops[1].id: Invalid input: expected string, received number",
        "- ops[1].at: Invalid input: expected number, received undefined",
      ].join("\n")
    )
  })
})

describe("formatError", () => {
  it("adds that nothing was applied for batch failures", () => {
    expect(
      formatError({
        code: "INVALID_OP",
        message: "ops[1] (move): bad",
        opIndex: 1,
      })
    ).toBe(
      "Error INVALID_OP: ops[1] (move): bad\nNothing in this batch was applied (it stopped at ops[1]). Fix that op and send the whole batch again."
    )
    expect(
      formatError({ code: "INVALID_OP", message: "No wall W9." })
    ).toContain("Nothing in this batch was applied. Fix")
    expect(formatError({ code: "NOT_FOUND", message: "Gone." })).toBe(
      "Error NOT_FOUND: Gone."
    )
  })
})

describe("errorResult", () => {
  it("is an isError result with the text and the structured error", () => {
    const result = errorResult(
      new ConvexError({ code: "CONFLICT", message: "Changed." })
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe("Error CONFLICT: Changed.")
    expect(result.structuredContent).toEqual({
      error: { code: "CONFLICT", message: "Changed." },
    })
  })
})
