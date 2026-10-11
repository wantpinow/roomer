import { describe, expect, it, vi } from "vitest"

import { errorFromBody, requestPhotoreal } from "../render-request"

describe("errorFromBody", () => {
  it("reads message, error, or a nested error message", () => {
    expect(errorFromBody(400, { message: "No camera 'x'." })).toBe(
      "No camera 'x'."
    )
    expect(errorFromBody(400, { error: "Bad model." })).toBe("Bad model.")
    expect(errorFromBody(409, { error: { message: "Busy." } })).toBe("Busy.")
  })

  it("explains a missing route and other statuses", () => {
    expect(errorFromBody(404, null)).toBe(
      "The render service isn't available yet."
    )
    expect(errorFromBody(500, "oops")).toBe(
      "The render request failed (HTTP 500)."
    )
  })
})

describe("requestPhotoreal", () => {
  const respond = (status: number, body: unknown) =>
    vi.fn<typeof fetch>(async () => Response.json(body, { status }))

  it("posts the request and returns the render id", async () => {
    const fetcher = respond(202, { renderId: "r123" })
    const result = await requestPhotoreal(
      "layout/1",
      { camera: "from-d1", model: "stub", quality: "low" },
      fetcher
    )
    expect(result).toEqual({ ok: true, renderId: "r123" })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe("/api/layouts/layout%2F1/renders")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).toEqual({
      camera: "from-d1",
      model: "stub",
      quality: "low",
    })
  })

  it("returns the server's message on failure", async () => {
    const result = await requestPhotoreal(
      "l1",
      { camera: "c" },
      respond(400, { message: "Unknown camera 'c'." })
    )
    expect(result).toEqual({ ok: false, message: "Unknown camera 'c'." })
  })

  it("survives a network failure", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed")
    })
    expect(await requestPhotoreal("l1", { camera: "c" }, fetcher)).toEqual({
      ok: false,
      message: "Couldn't reach the app's server.",
    })
  })
})
