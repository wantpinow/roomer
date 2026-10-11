import { describe, expect, it, vi } from "vitest"

import { localOnly, rejectNonLocal } from "../host-guard"

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/mcp/mcp", {
    method: "POST",
    headers,
  })
}

describe("rejectNonLocal", () => {
  it.each(["localhost:3000", "localhost", "127.0.0.1:3000", "[::1]:3000"])(
    "lets Host %s through",
    (host) => {
      expect(rejectNonLocal(request({ host }))).toBeNull()
    }
  )

  it("refuses a rebinding hostname with a 403", async () => {
    const response = rejectNonLocal(request({ host: "evil.example:3000" }))
    expect(response?.status).toBe(403)
    expect(await response?.json()).toEqual({
      error: expect.stringMatching(/^Roomer only answers local requests/),
    })
  })

  it("refuses a request without a Host header", () => {
    const headers = new Headers()
    const bare = new Request("http://localhost:3000/api/mcp/mcp", { headers })
    // Request fills nothing in by itself; an absent Host is rejected.
    expect(rejectNonLocal(bare)?.status).toBe(403)
  })

  it("refuses a local Host with a foreign browser Origin", () => {
    const response = rejectNonLocal(
      request({ host: "localhost:3000", origin: "https://evil.example" })
    )
    expect(response?.status).toBe(403)
  })

  it("accepts a local Origin and no Origin at all", () => {
    expect(
      rejectNonLocal(
        request({ host: "localhost:3000", origin: "http://localhost:3000" })
      )
    ).toBeNull()
    expect(
      rejectNonLocal(
        request({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" })
      )
    ).toBeNull()
  })
})

describe("localOnly", () => {
  it("only runs the handler for local requests", async () => {
    const handler = vi.fn(async () => new Response("ok"))
    const guarded = localOnly(handler)
    expect((await guarded(request({ host: "localhost:3000" }))).status).toBe(
      200
    )
    expect((await guarded(request({ host: "roomer.evil" }))).status).toBe(403)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
