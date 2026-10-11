import { createGateway, type GatewayProvider } from "@ai-sdk/gateway"

import {
  PhotorealError,
  toPhotorealError,
  type ToPhotorealErrorContext,
} from "../errors"
import { isPng } from "../png"
import type { InputImage } from "../types"

// Shared plumbing for the AI Gateway renderers: one provider per renderer,
// a per-attempt timeout, one retry on upstream failures, and error mapping.
// The renderers go through the AI SDK (`ai` + `@ai-sdk/gateway`, as in
// masterguest) rather than raw fetch: it covers all three API shapes the
// models need (OpenAI/FLUX image edits, Gemini chat with image output) and
// takes a custom `fetch`, which is what the tests swap in.

export const DEFAULT_TIMEOUT_MS = 180_000
export const DEFAULT_RETRIES = 1
export const DEFAULT_RETRY_DELAY_MS = 1_500

export interface GatewayRendererOptions {
  /** AI_GATEWAY_API_KEY. Required: the renderers never fall back to OIDC. */
  apiKey: string
  /** Override the gateway base URL (tests). */
  baseURL?: string
  /** Custom fetch (tests). */
  fetch?: typeof globalThis.fetch
  /** Per-attempt timeout. Default 180s. */
  timeoutMs?: number
  /** Extra attempts after an upstream (5xx / network) failure. Default 1. */
  retries?: number
  /** Pause before a retry. Default 1.5s. */
  retryDelayMs?: number
}

export function createGatewayProvider(
  options: GatewayRendererOptions
): GatewayProvider {
  return createGateway({
    apiKey: options.apiKey,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Run one gateway call with a timeout per attempt and a retry on upstream
 * failures. A caller abort (`signal`) is rethrown as-is, not mapped.
 */
export async function runGatewayCall<T>(
  model: string,
  options: GatewayRendererOptions,
  signal: AbortSignal | undefined,
  call: (abortSignal: AbortSignal) => Promise<T>
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const attempts = 1 + Math.max(0, options.retries ?? DEFAULT_RETRIES)
  const context: ToPhotorealErrorContext = {
    model,
    secrets: [options.apiKey],
    timeoutMs,
  }
  for (let attempt = 1; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      return await call(abortSignal)
    } catch (thrown) {
      if (signal?.aborted) throw signal.reason
      const error = timeout.aborted
        ? new PhotorealError(
            "TIMEOUT",
            `${model} did not finish after ${Math.round(timeoutMs / 1000)}s. Image models can be slow under load; try again, or use a faster model (openai/gpt-image-2.5-flare).`,
            { model, cause: thrown }
          )
        : toPhotorealError(thrown, context)
      if (!error.retryable || attempt >= attempts) throw error
      await sleep(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS, signal)
    }
  }
}

/** Inline an input image as a data URL (keeps our declared media type). */
export function toDataUrl(image: Pick<InputImage, "data" | "mime">): string {
  return `data:${image.mime};base64,${image.data.toString("base64")}`
}

export function assertInputCount(
  model: string,
  images: readonly InputImage[],
  max: number
): void {
  if (images.length === 0) {
    throw new PhotorealError(
      "BAD_REQUEST",
      `${model} needs at least one input image (the clay render).`,
      { model }
    )
  }
  if (images.length > max) {
    throw new PhotorealError(
      "BAD_REQUEST",
      `${model} accepts at most ${max} input images; got ${images.length}. Send fewer references.`,
      { model }
    )
  }
}

/** Every renderer promises PNG; anything else is an upstream surprise. */
export function requirePng(model: string, data: Uint8Array): Buffer {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  if (!isPng(buffer)) {
    throw new PhotorealError(
      "UPSTREAM",
      `${model} returned an image that is not a PNG.`,
      { model }
    )
  }
  return buffer
}
