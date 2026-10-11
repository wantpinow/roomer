import type { PhotorealModel } from "@roomer/core/schema"

import { PhotorealError } from "../errors"
import type { ImageRenderer } from "../types"
import {
  FLUX_MAX_INPUT_IMAGES,
  createGatewayFluxRenderer,
} from "./gateway-flux"
import {
  GEMINI_MAX_INPUT_IMAGES,
  createGatewayGeminiRenderer,
} from "./gateway-gemini"
import {
  OPENAI_MAX_INPUT_IMAGES,
  createGatewayOpenAIRenderer,
} from "./gateway-openai"
import type { GatewayRendererOptions } from "./gateway"
import { STUB_MAX_INPUT_IMAGES, createStubRenderer } from "./stub"

export type { GatewayRendererOptions } from "./gateway"

/** Input image limits per model (passes + references), without a renderer. */
export const MAX_INPUT_IMAGES = {
  "openai/gpt-image-2.5-sunburst": OPENAI_MAX_INPUT_IMAGES,
  "openai/gpt-image-2.5-flare": OPENAI_MAX_INPUT_IMAGES,
  "google/gemini-3-pro-image": GEMINI_MAX_INPUT_IMAGES,
  "google/gemini-3.1-flash-image": GEMINI_MAX_INPUT_IMAGES,
  "bfl/flux-3-image": FLUX_MAX_INPUT_IMAGES,
  stub: STUB_MAX_INPUT_IMAGES,
} as const satisfies Record<PhotorealModel, number>

export interface ImageRendererOptions extends Partial<GatewayRendererOptions> {
  /** Use the free stub whatever model was asked for (PHOTOREAL_STUB=1). */
  stub?: boolean
}

/**
 * The renderer for `model`. The stub needs nothing; every gateway model
 * needs `apiKey` and fails with an AUTH error that says so when it is
 * missing. Callers that read env should use `getConfiguredImageRenderer`
 * from ../server.
 */
export function getImageRenderer(
  model: PhotorealModel,
  options: ImageRendererOptions = {}
): ImageRenderer {
  if (model === "stub" || options.stub) return createStubRenderer()
  const apiKey = options.apiKey?.trim()
  if (!apiKey) {
    throw new PhotorealError(
      "AUTH",
      "AI_GATEWAY_API_KEY is not set, so live photoreal renders are off. Add it to the repo-root .env.local, or set PHOTOREAL_STUB=1 for the free stub renderer.",
      { model }
    )
  }
  const gateway: GatewayRendererOptions = { ...options, apiKey }
  switch (model) {
    case "openai/gpt-image-2.5-sunburst":
    case "openai/gpt-image-2.5-flare":
      return createGatewayOpenAIRenderer(model, gateway)
    case "google/gemini-3-pro-image":
    case "google/gemini-3.1-flash-image":
      return createGatewayGeminiRenderer(model, gateway)
    case "bfl/flux-3-image":
      return createGatewayFluxRenderer(gateway)
    default:
      return model satisfies never
  }
}
