import { generateImage } from "ai"

import { openAIImageSize } from "../size"
import type { ImageRenderer } from "../types"
import {
  assertInputCount,
  createGatewayProvider,
  type GatewayRendererOptions,
  requirePng,
  runGatewayCall,
  toDataUrl,
} from "./gateway"

// gpt-image-2.5 (sunburst = precise edits, flare = fast) through the
// gateway's image-model API: every input image goes in as an edit input, the
// output size must be divisible by 16 and above the minimum pixel budget
// (see ../size), and quality is an OpenAI provider option.

export const OPENAI_IMAGE_MODELS = [
  "openai/gpt-image-2.5-sunburst",
  "openai/gpt-image-2.5-flare",
] as const

export type OpenAIImageModel = (typeof OPENAI_IMAGE_MODELS)[number]

/** gpt-image edits take up to 16 input images. */
export const OPENAI_MAX_INPUT_IMAGES = 16

export function createGatewayOpenAIRenderer(
  model: OpenAIImageModel,
  options: GatewayRendererOptions
): ImageRenderer {
  const gateway = createGatewayProvider(options)
  return {
    id: model,
    maxInputImages: OPENAI_MAX_INPUT_IMAGES,
    prefersIdPass: true,
    async render({ prompt, images, size, quality, signal }) {
      assertInputCount(model, images, OPENAI_MAX_INPUT_IMAGES)
      const outputSize = openAIImageSize(size)
      const result = await runGatewayCall(
        model,
        options,
        signal,
        (abortSignal) =>
          generateImage({
            model: gateway.image(model),
            prompt: { text: prompt, images: images.map(toDataUrl) },
            ...(outputSize ? { size: outputSize } : {}),
            providerOptions: { openai: { quality } },
            maxRetries: 0,
            abortSignal,
          })
      )
      return {
        png: requirePng(model, result.image.uint8Array),
        raw: {
          warnings: result.warnings,
          usage: result.usage,
          providerMetadata: result.providerMetadata,
        },
      }
    },
  }
}
