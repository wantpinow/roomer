import { describe, expect, it } from "vitest"

import { PhotorealError } from "../errors"
import { getImageRenderer, MAX_INPUT_IMAGES } from "../renderers"
import type { GatewayRendererOptions } from "../renderers/gateway"
import type { ImageRenderRequest, InputImage } from "../types"
import { solidPng } from "./helpers"

// The gateway renderers run through the real AI SDK with a fake `fetch`, so
// these tests pin both what we send over the wire and how gateway failures
// become PhotorealErrors.

const API_KEY = "test-gateway-key-0123456789abcdef"
const OUTPUT = solidPng(6, 4, [120, 90, 60])
const CLAY = solidPng(24, 16, [180, 180, 180])
const REF = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3])

const images: InputImage[] = [
  { role: "clay", data: CLAY, mime: "image/png", label: "clay render" },
  { role: "id", data: CLAY, mime: "image/png", label: "ID map" },
  { role: "reference", data: REF, mime: "image/jpeg", label: "product photo" },
]

const request: ImageRenderRequest = {
  prompt: "Make it real.",
  images,
  size: { width: 1536, height: 1024 },
  quality: "low",
}

interface Call {
  url: string
  body: Record<string, unknown>
  headers: Headers
}

type Reply = Response | Error | "hang"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const imageOk = () =>
  json(200, {
    images: [OUTPUT.toString("base64")],
    warnings: [],
    providerMetadata: { gateway: { cost: "0.01" } },
  })

const gatewayError = (status: number, type: string, message: string) =>
  json(status, { error: { message, type } })

function fakeFetch(...replies: Reply[]) {
  const calls: Call[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")),
      headers: new Headers(init?.headers),
    })
    const reply = replies.shift() ?? new Error("no more replies")
    if (reply === "hang") {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        })
      })
    }
    if (reply instanceof Error) throw reply
    return reply
  }
  return { fetch, calls }
}

function options(
  fetch: typeof globalThis.fetch,
  extra: Partial<GatewayRendererOptions> = {}
): GatewayRendererOptions {
  return {
    apiKey: API_KEY,
    baseURL: "https://gateway.test/v4/ai",
    fetch,
    retryDelayMs: 0,
    ...extra,
  }
}

describe("getImageRenderer", () => {
  it("returns the stub for the stub model or when stubbing is forced", () => {
    expect(getImageRenderer("stub").id).toBe("stub")
    expect(
      getImageRenderer("openai/gpt-image-2.5-sunburst", { stub: true }).id
    ).toBe("stub")
  })

  it("refuses live models without an API key, with an AUTH error", () => {
    for (const apiKey of [undefined, "", "   "]) {
      const attempt = () =>
        getImageRenderer(
          "bfl/flux-3-image",
          apiKey === undefined ? {} : { apiKey }
        )
      expect(attempt).toThrow(PhotorealError)
      expect(attempt).toThrow(/AI_GATEWAY_API_KEY is not set/)
    }
  })

  it("builds each gateway model with its input limit", () => {
    for (const model of [
      "openai/gpt-image-2.5-sunburst",
      "openai/gpt-image-2.5-flare",
      "google/gemini-3-pro-image",
      "google/gemini-3.1-flash-image",
      "bfl/flux-3-image",
    ] as const) {
      const renderer = getImageRenderer(model, { apiKey: API_KEY })
      expect(renderer.id).toBe(model)
      expect(renderer.maxInputImages).toBe(MAX_INPUT_IMAGES[model])
    }
    expect(MAX_INPUT_IMAGES["openai/gpt-image-2.5-sunburst"]).toBe(16)
    // Spike: Gemini paints id-map colours onto small items, so it skips the map.
    expect(
      getImageRenderer("google/gemini-3-pro-image", { apiKey: API_KEY })
        .prefersIdPass
    ).toBe(false)
    expect(
      getImageRenderer("openai/gpt-image-2.5-sunburst", { apiKey: API_KEY })
        .prefersIdPass
    ).toBe(true)
    expect(MAX_INPUT_IMAGES["bfl/flux-3-image"]).toBe(10)
  })
})

describe("gateway-openai renderer", () => {
  it("sends every image as an edit input with size and quality", async () => {
    const { fetch, calls } = fakeFetch(imageOk())
    const renderer = getImageRenderer(
      "openai/gpt-image-2.5-sunburst",
      options(fetch)
    )
    const { png, raw } = await renderer.render(request)

    expect(png.equals(OUTPUT)).toBe(true)
    expect(raw).toMatchObject({
      providerMetadata: { gateway: { cost: "0.01" } },
    })
    const [call] = calls
    expect(call!.url).toBe("https://gateway.test/v4/ai/image-model")
    expect(call!.headers.get("ai-model-id")).toBe(
      "openai/gpt-image-2.5-sunburst"
    )
    expect(call!.headers.get("authorization")).toBe(`Bearer ${API_KEY}`)
    expect(call!.body).toMatchObject({
      prompt: "Make it real.",
      n: 1,
      size: "1536x1024",
      providerOptions: { openai: { quality: "low" } },
    })
    const files = call!.body.files as { mediaType: string; data: string }[]
    expect(files.map((f) => f.mediaType)).toEqual([
      "image/png",
      "image/png",
      "image/jpeg",
    ])
    expect(Buffer.from(files[2]!.data, "base64").equals(REF)).toBe(true)
  })

  it("rounds sizes to what gpt-image accepts and omits size for auto", async () => {
    const { fetch, calls } = fakeFetch(imageOk(), imageOk())
    const renderer = getImageRenderer(
      "openai/gpt-image-2.5-flare",
      options(fetch)
    )
    await renderer.render({ ...request, size: { width: 768, height: 512 } })
    await renderer.render({ ...request, size: "auto" })
    expect(calls[0]!.body.size).toBe("992x672")
    expect(calls[1]!.body).not.toHaveProperty("size")
  })

  it("rejects too many input images before calling the gateway", async () => {
    const { fetch, calls } = fakeFetch()
    const renderer = getImageRenderer(
      "openai/gpt-image-2.5-flare",
      options(fetch)
    )
    const many = Array.from({ length: 17 }, () => images[2]!)
    await expect(
      renderer.render({ ...request, images: many })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("at most 16"),
    })
    await expect(
      renderer.render({ ...request, images: [] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(calls).toHaveLength(0)
  })

  it("rejects a non-PNG result as an upstream error", async () => {
    const { fetch } = fakeFetch(
      json(200, { images: [REF.toString("base64")], warnings: [] })
    )
    const renderer = getImageRenderer(
      "openai/gpt-image-2.5-flare",
      options(fetch)
    )
    await expect(renderer.render(request)).rejects.toMatchObject({
      code: "UPSTREAM",
      message: expect.stringContaining("not a PNG"),
    })
  })
})

describe("gateway-flux renderer", () => {
  it("sends an aspect ratio instead of a pixel size and no quality", async () => {
    const { fetch, calls } = fakeFetch(imageOk())
    const renderer = getImageRenderer("bfl/flux-3-image", options(fetch))
    await renderer.render(request)
    const body = calls[0]!.body
    expect(calls[0]!.headers.get("ai-model-id")).toBe("bfl/flux-3-image")
    expect(body.aspectRatio).toBe("3:2")
    expect(body).not.toHaveProperty("size")
    expect(body.providerOptions ?? {}).toEqual({})
    expect(body.files).toHaveLength(3)
  })

  it("accepts up to 10 inputs", async () => {
    const { fetch } = fakeFetch()
    const renderer = getImageRenderer("bfl/flux-3-image", options(fetch))
    const eleven = Array.from({ length: 11 }, () => images[0]!)
    await expect(
      renderer.render({ ...request, images: eleven })
    ).rejects.toThrow(/at most 10/)
  })
})

const geminiOk = (content: unknown[], unified = "stop") =>
  json(200, {
    content,
    finishReason: { unified, raw: unified.toUpperCase() },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0 },
      outputTokens: { total: 20, text: 20, reasoning: 0 },
    },
    warnings: [],
    providerMetadata: { gateway: { cost: "0.067" } },
  })

const geminiImage = (data: Buffer) => ({
  type: "file",
  mediaType: "image/png",
  data: { type: "data", data: data.toString("base64") },
})

describe("gateway-gemini renderer", () => {
  it("sends a chat turn with captioned images and image output on", async () => {
    const { fetch, calls } = fakeFetch(geminiOk([geminiImage(OUTPUT)]))
    const renderer = getImageRenderer(
      "google/gemini-3-pro-image",
      options(fetch)
    )
    const { png } = await renderer.render({ ...request, quality: "medium" })

    expect(png.equals(OUTPUT)).toBe(true)
    const call = calls[0]!
    expect(call.url).toBe("https://gateway.test/v4/ai/language-model")
    expect(call.headers.get("ai-language-model-id")).toBe(
      "google/gemini-3-pro-image"
    )
    expect(call.body.providerOptions).toEqual({
      google: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "3:2", imageSize: "2K" },
      },
    })
    const prompt = call.body.prompt as {
      content: { type: string; text?: string; mediaType?: string }[]
    }[]
    const parts = prompt[0]!.content
    expect(parts.map((p) => p.type)).toEqual([
      "text",
      "text",
      "file",
      "text",
      "file",
      "text",
      "file",
    ])
    expect(parts[0]!.text).toBe("Make it real.")
    expect(parts[1]!.text).toBe("Image 1 — clay render:")
    expect(parts[5]!.text).toBe("Image 3 — product photo:")
    expect(parts[6]!.mediaType).toBe("image/jpeg")
  })

  it("maps a text-only answer to UPSTREAM and a filtered one to MODERATION", async () => {
    const { fetch } = fakeFetch(
      geminiOk([{ type: "text", text: "I can't   render that." }]),
      geminiOk([], "content-filter")
    )
    const renderer = getImageRenderer(
      "google/gemini-3.1-flash-image",
      options(fetch)
    )
    await expect(renderer.render(request)).rejects.toMatchObject({
      code: "UPSTREAM",
      message: expect.stringContaining(`It replied: "I can't render that."`),
    })
    await expect(renderer.render(request)).rejects.toMatchObject({
      code: "MODERATION",
    })
  })
})

describe("gateway error handling", () => {
  const flare = (fetch: typeof globalThis.fetch, extra = {}) =>
    getImageRenderer("openai/gpt-image-2.5-flare", options(fetch, extra))

  it("maps a rejected key to AUTH without echoing it", async () => {
    const { fetch, calls } = fakeFetch(
      gatewayError(401, "authentication_error", `Invalid key ${API_KEY}`)
    )
    const error = await flare(fetch)
      .render(request)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PhotorealError)
    expect(error).toMatchObject({ code: "AUTH", status: 401 })
    expect(String((error as Error).message)).not.toContain(API_KEY)
    expect(calls).toHaveLength(1)
  })

  it("maps 429 to RATE_LIMIT without retrying", async () => {
    const { fetch, calls } = fakeFetch(
      gatewayError(429, "rate_limit_exceeded", "Too many requests")
    )
    await expect(flare(fetch).render(request)).rejects.toMatchObject({
      code: "RATE_LIMIT",
      status: 429,
    })
    expect(calls).toHaveLength(1)
  })

  it("maps a safety refusal to MODERATION", async () => {
    const { fetch } = fakeFetch(
      gatewayError(
        400,
        "invalid_request_error",
        "Your request was rejected as a result of our safety system."
      )
    )
    await expect(flare(fetch).render(request)).rejects.toMatchObject({
      code: "MODERATION",
    })
  })

  it("maps other 4xx to BAD_REQUEST with the gateway's reason, redacted", async () => {
    const { fetch, calls } = fakeFetch(
      gatewayError(
        400,
        "invalid_request_error",
        `Invalid size '1000x670'. Width and height must both be divisible by 16. (auth: Bearer ${API_KEY})`
      )
    )
    const error = await flare(fetch)
      .render(request)
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: "BAD_REQUEST", status: 400 })
    const message = (error as Error).message
    expect(message).toContain("divisible by 16")
    expect(message).not.toContain(API_KEY)
    expect(calls).toHaveLength(1)
  })

  it("retries a 5xx once and succeeds", async () => {
    const { fetch, calls } = fakeFetch(
      gatewayError(503, "internal_server_error", "Service unavailable"),
      imageOk()
    )
    const { png } = await flare(fetch).render(request)
    expect(png.equals(OUTPUT)).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it("gives up after one retry with UPSTREAM", async () => {
    const { fetch, calls } = fakeFetch(
      gatewayError(500, "internal_server_error", "boom"),
      new TypeError("fetch failed")
    )
    await expect(flare(fetch).render(request)).rejects.toMatchObject({
      code: "UPSTREAM",
    })
    expect(calls).toHaveLength(2)
  })

  it("retries as configured", async () => {
    const { fetch, calls } = fakeFetch(
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed")
    )
    await expect(
      flare(fetch, { retries: 0 }).render(request)
    ).rejects.toMatchObject({ code: "UPSTREAM" })
    expect(calls).toHaveLength(1)
  })

  it("times out a hung call with TIMEOUT and does not retry it", async () => {
    const { fetch, calls } = fakeFetch("hang", imageOk())
    await expect(
      flare(fetch, { timeoutMs: 30 }).render(request)
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      message: expect.stringContaining("did not finish"),
    })
    expect(calls).toHaveLength(1)
  })

  it("rethrows a caller abort as-is", async () => {
    const { fetch, calls } = fakeFetch("hang", imageOk())
    const controller = new AbortController()
    const pending = flare(fetch).render({
      ...request,
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(new Error("user cancelled")), 10)
    await expect(pending).rejects.toThrow("user cancelled")
    expect(calls).toHaveLength(1)
  })
})
