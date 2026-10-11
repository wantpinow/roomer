import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"

import { errorMessage } from "../error-message"

describe("errorMessage", () => {
  it("shows a ConvexError's string payload", () => {
    expect(errorMessage(new ConvexError("Wall W7 does not exist."))).toBe(
      "Wall W7 does not exist."
    )
  })

  it("falls back for a structured ConvexError payload", () => {
    expect(errorMessage(new ConvexError({ code: "INVALID_INPUT" }))).toBe(
      "Something went wrong. Please try again."
    )
  })

  it("falls back for plain errors, with a custom fallback", () => {
    expect(
      errorMessage(new Error("[Request ID: abc] Server Error"), "Nope")
    ).toBe("Nope")
  })
})
