import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"

import { appErrorOf, describeError } from "../app-error"

describe("appErrorOf", () => {
  it("reads the backend's structured errors", () => {
    const error = new ConvexError({
      code: "CONFLICT",
      message: "Layout 'Starter' is at revision 4, not 3.",
    })
    expect(appErrorOf(error)).toEqual({
      code: "CONFLICT",
      message: "Layout 'Starter' is at revision 4, not 3.",
    })
  })

  it("ignores unknown codes, string payloads and plain errors", () => {
    expect(
      appErrorOf(new ConvexError({ code: "NOPE", message: "x" }))
    ).toBeNull()
    expect(appErrorOf(new ConvexError("just text"))).toBeNull()
    expect(appErrorOf(new Error("boom"))).toBeNull()
    expect(appErrorOf(undefined)).toBeNull()
  })
})

describe("describeError", () => {
  it("prefers the structured message, then a string payload", () => {
    expect(
      describeError(
        new ConvexError({ code: "INVALID_OP", message: "No placement 'x'." })
      )
    ).toBe("No placement 'x'.")
    expect(describeError(new ConvexError("Plain words."))).toBe("Plain words.")
  })

  it("falls back for faults", () => {
    expect(describeError(new Error("Server Error"), "Try again.")).toBe(
      "Try again."
    )
  })
})
