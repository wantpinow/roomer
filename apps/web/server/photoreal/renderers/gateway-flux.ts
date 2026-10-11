import { generateImage } from "ai"

import { nearestAspectRatio } from "../size"
import type { ImageRenderer } from "../types"
import {
  assertInputCount,
  createGatewayProvider,
  type GatewayRendererOptions,
  requirePng,
  runGatewayCall,
  toDataUrl,
} from "./gateway"

// FLUX 3 through the gateway's image-model API. It takes up to 10 reference
// images and picks its own resolution class (≈1 MP by default: 1248×832 at
// 3:2), so we send an aspect ratio rather than a pixel size — sending `size`
// only earns an "unsupported" warning. It has no quality knob.

export const FLUX_MODEL = "bfl/flux-3-image"

/** FLUX 3 edits take up to 10 reference images. */
export const FLUX_MAX_INPUT_IMAGES = 10

export function createGatewayFluxRenderer(
  options: GatewayRendererOptions
): ImageRenderer {
  const gateway = createGatewayProvider(options)
  const model = FLUX_MODEL
  return {
    id: model,
    maxInputImages: FLUX_MAX_INPUT_IMAGES,
    async render({ prompt, images, size, signal }) {
      assertInputCount(model, images, FLUX_MAX_INPUT_IMAGES)
      const aspectRatio = nearestAspectRatio(size)
      const result = await runGatewayCall(
        model,
        options,
        signal,
        (abortSignal) =>
          generateImage({
            model: gateway.image(model),
            prompt: { text: prompt, images: images.map(toDataUrl) },
            ...(aspectRatio ? { aspectRatio } : {}),
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
