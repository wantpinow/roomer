import { describe, expect, it, vi } from "vitest"

import { DownloadError, downloadImage, uploadToStorage } from "../files"

function respond(body: BodyInit | null, init: ResponseInit = {}): typeof fetch {
  return vi.fn(async () => new Response(body, init))
}

describe("downloadImage", () => {
  it("returns the bytes and media type of an image", async () => {
    const fetchImpl = respond(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/JPEG; charset=binary" },
    })
    const image = await downloadImage("https://x.test/a.jpg", fetchImpl)
    expect(image).toEqual({ data: Buffer.from([1, 2, 3]), mime: "image/jpeg" })
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://x.test/a.jpg",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: expect.any(String) }),
      })
    )
  })

  it.each([
    ["not a url", respond(null), "not a valid URL."],
    ["file:///etc/passwd", respond(null), "only http(s) URLs"],
    ["https://x.test/a", respond("no", { status: 403 }), "HTTP 403"],
    [
      "https://x.test/page",
      respond("<html>", { headers: { "content-type": "text/html" } }),
      "not an image (content type 'text/html')",
    ],
    [
      "https://x.test/huge.jpg",
      respond("x", {
        headers: { "content-type": "image/png", "content-length": "99999999" },
      }),
      "the limit is 15.0MB",
    ],
  ])("refuses %s", async (url, fetchImpl, message) => {
    const error = await downloadImage(url, fetchImpl).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DownloadError)
    expect((error as DownloadError).message).toContain(message)
    expect((error as DownloadError).message).toContain(
      `Couldn't download ${url}`
    )
  })

  it("caps the size even without a content-length", async () => {
    const fetchImpl = respond(new Uint8Array(20), {
      headers: { "content-type": "image/png" },
    })
    await expect(
      downloadImage("https://x.test/a.png", fetchImpl, { maxBytes: 10 })
    ).rejects.toThrow("the image is 0.0MB")
  })

  it("reports network failures and timeouts", async () => {
    const failing: typeof fetch = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })
    await expect(
      downloadImage("https://x.test/a.png", failing)
    ).rejects.toThrow("fetch failed.")
    const slow: typeof fetch = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError")
    })
    await expect(
      downloadImage("https://x.test/a.png", slow, { timeoutMs: 2000 })
    ).rejects.toThrow("timed out after 2s.")
  })
})

describe("uploadToStorage", () => {
  it("posts the bytes and returns the storage id", async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("POST")
        expect(init?.headers).toEqual({ "Content-Type": "image/png" })
        return Response.json({ storageId: "kg2abc" })
      }
    )
    await expect(
      uploadToStorage(
        "http://127.0.0.1:3210/upload",
        Buffer.from([1]),
        "image/png",
        fetchImpl
      )
    ).resolves.toBe("kg2abc")
  })

  it("fails on an error status or a missing id", async () => {
    await expect(
      uploadToStorage(
        "u",
        Buffer.from([1]),
        "image/png",
        respond("nope", { status: 500 })
      )
    ).rejects.toThrow("Convex storage upload failed: HTTP 500 nope")
    await expect(
      uploadToStorage(
        "u",
        Buffer.from([1]),
        "image/png",
        vi.fn(async () => Response.json({}))
      )
    ).rejects.toThrow("returned no storageId")
  })
})
