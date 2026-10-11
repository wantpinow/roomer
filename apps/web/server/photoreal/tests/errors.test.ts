import { describe, expect, it } from "vitest"

import {
  PhotorealError,
  isPhotorealError,
  networkCode,
  redactSecrets,
  toPhotorealError,
} from "../errors"

const model = "openai/gpt-image-2.5-sunburst"

function upstream(
  statusCode: number | undefined,
  message: string,
  name = "Error"
) {
  return Object.assign(new Error(message), { statusCode, name })
}

describe("redactSecrets", () => {
  it("removes known secrets, bearer tokens and key-shaped tokens", () => {
    const text =
      "key=abcdefgh12345678 auth: Bearer xyz.123 token vck_ABCDEFGHIJKLMNOPQRST and sk-0123456789abcdefghij"
    const clean = redactSecrets(text, ["abcdefgh12345678", "short"])
    expect(clean).toBe(
      "key=[redacted] auth: Bearer [redacted] token [redacted] and [redacted]"
    )
  })

  it("ignores secrets too short to be meaningful", () => {
    expect(redactSecrets("a b c", ["a"])).toBe("a b c")
  })
})

describe("toPhotorealError", () => {
  it("passes PhotorealErrors through", () => {
    const original = new PhotorealError("AUTH", "nope")
    expect(toPhotorealError(original, { model })).toBe(original)
    expect(
      toPhotorealError(
        Object.assign(new Error("retry"), { lastError: original }),
        {
          model,
        }
      )
    ).toBe(original)
  })

  it.each([
    [401, "AUTH"],
    [403, "AUTH"],
    [429, "RATE_LIMIT"],
    [400, "BAD_REQUEST"],
    [404, "BAD_REQUEST"],
    [422, "BAD_REQUEST"],
    [408, "TIMEOUT"],
    [504, "TIMEOUT"],
    [500, "UPSTREAM"],
    [502, "UPSTREAM"],
    [undefined, "UPSTREAM"],
  ] as const)("maps HTTP %s to %s", (status, code) => {
    const error = toPhotorealError(upstream(status, "something"), { model })
    expect(error.code).toBe(code)
    expect(error.model).toBe(model)
    expect(error.status).toBe(status)
    expect(error.retryable).toBe(code === "UPSTREAM")
  })

  it("recognises timeouts by error name", () => {
    for (const name of ["TimeoutError", "GatewayTimeoutError"]) {
      const error = toPhotorealError(upstream(undefined, "slow", name), {
        model,
        timeoutMs: 180_000,
      })
      expect(error.code).toBe("TIMEOUT")
      expect(error.message).toContain("after 180s")
    }
  })

  it("recognises moderation refusals by wording, whatever the status", () => {
    for (const message of [
      "Your request was rejected as a result of our safety system.",
      "moderation_blocked: image flagged",
      "Request blocked due to content policy",
    ]) {
      expect(toPhotorealError(upstream(400, message), { model }).code).toBe(
        "MODERATION"
      )
    }
  })

  it("unwraps the AI SDK's RetryError to its last error", () => {
    const retry = Object.assign(new Error("Failed after 3 attempts"), {
      lastError: upstream(429, "slow down"),
    })
    expect(toPhotorealError(retry, { model }).code).toBe("RATE_LIMIT")
  })

  it("keeps messages short, single-line and free of the key", () => {
    const key = "super-secret-gateway-key"
    const error = toPhotorealError(
      upstream(400, `bad\n\nrequest ${key} ${"x".repeat(600)}`),
      { model, secrets: [key] }
    )
    expect(error.message).not.toContain(key)
    expect(error.message).not.toContain("\n")
    expect(error.message.length).toBeLessThan(400)
    expect(
      error.message.startsWith(`${model} rejected the request: bad request`)
    ).toBe(true)
  })

  it("handles thrown strings and non-errors", () => {
    expect(toPhotorealError("socket hang up", { model }).message).toContain(
      "socket hang up"
    )
    expect(toPhotorealError(undefined, { model }).code).toBe("UPSTREAM")
  })

  it("keeps the original as the cause", () => {
    const original = upstream(500, "boom")
    const error = toPhotorealError(original, { model })
    expect(error.cause).toBe(original)
    expect(isPhotorealError(error)).toBe(true)
    expect(isPhotorealError(original)).toBe(false)
    expect(error.name).toBe("PhotorealError")
  })

  it("explains a dropped connection found in the cause chain", () => {
    const socket = Object.assign(new Error("other side closed"), {
      code: "UND_ERR_SOCKET",
    })
    const fetchFailed = new TypeError("fetch failed", { cause: socket })
    const gateway = Object.assign(
      new Error("Invalid error response format: Gateway request failed", {
        cause: fetchFailed,
      }),
      { statusCode: 500 }
    )
    expect(networkCode(gateway)).toBe("UND_ERR_SOCKET")
    const error = toPhotorealError(gateway, { model: "bfl/flux-3-image" })
    expect(error.code).toBe("UPSTREAM")
    expect(error.message).toContain(
      "The connection was dropped (UND_ERR_SOCKET)"
    )
    expect(error.message).not.toContain("..")
    expect(networkCode(new Error("plain"))).toBeUndefined()
  })
})
