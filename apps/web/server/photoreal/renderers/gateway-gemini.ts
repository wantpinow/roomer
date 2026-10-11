import { generateText } from "ai"

import { PhotorealError } from "../errors"
import { GEMINI_IMAGE_SIZE, nearestAspectRatio } from "../size"
import type { ImageRenderer } from "../types"
import {
  assertInputCount,
  createGatewayProvider,
  type GatewayRendererOptions,
  requirePng,
  runGatewayCall,
  toDataUrl,
} from "./gateway"

// Nano Banana Pro / Nano Banana 2. The gateway serves these as *language*
// models (its image API answers "is a language model, not an image model"),
// so the call is a chat turn with image output switched on. Each input image
// is preceded by a short "Image N — …" caption so the prompt's numbering is
// unambiguous; output size is an aspect ratio plus a resolution class.

export const GEMINI_IMAGE_MODELS = [
  "google/gemini-3-pro-image",
  "google/gemini-3.1-flash-image",
] as const

export type GeminiImageModel = (typeof GEMINI_IMAGE_MODELS)[number]

/** Gemini 3 image models take up to 14 input images. */
export const GEMINI_MAX_INPUT_IMAGES = 14

const MAX_REPLY_IN_ERROR = 200

export function createGatewayGeminiRenderer(
  model: GeminiImageModel,
  options: GatewayRendererOptions
): ImageRenderer {
  const gateway = createGatewayProvider(options)
  return {
    id: model,
    maxInputImages: GEMINI_MAX_INPUT_IMAGES,
    // Gemini copies id-map colours onto small items; see ImageRenderer.
    prefersIdPass: false,
    async render({ prompt, images, size, quality, signal }) {
      assertInputCount(model, images, GEMINI_MAX_INPUT_IMAGES)
      const aspectRatio = nearestAspectRatio(size)
      const result = await runGatewayCall(
        model,
        options,
        signal,
        (abortSignal) =>
          generateText({
            model: gateway(model),
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  ...images.flatMap((image, index) => [
                    {
                      type: "text" as const,
                      text: `Image ${index + 1} — ${image.label}:`,
                    },
                    {
                      type: "file" as const,
                      data: toDataUrl(image),
                      mediaType: image.mime,
                    },
                  ]),
                ],
              },
            ],
            providerOptions: {
              google: {
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: {
                  ...(aspectRatio ? { aspectRatio } : {}),
                  imageSize: GEMINI_IMAGE_SIZE[quality],
                },
              },
            },
            maxRetries: 0,
            abortSignal,
          })
      )
      const image = result.files
        .filter((file) => file.mediaType.startsWith("image/"))
        .at(-1)
      if (!image) {
        const reply = result.text.replace(/\s+/g, " ").trim()
        const said = reply
          ? ` It replied: "${reply.slice(0, MAX_REPLY_IN_ERROR)}"`
          : ""
        throw result.finishReason === "content-filter"
          ? new PhotorealError(
              "MODERATION",
              `${model} refused the request on content-safety grounds.${said}`,
              { model }
            )
          : new PhotorealError(
              "UPSTREAM",
              `${model} answered without an image.${said} Try again or use another model.`,
              { model }
            )
      }
      return {
        png: requirePng(model, image.uint8Array),
        raw: {
          text: result.text,
          finishReason: result.finishReason,
          warnings: result.warnings,
          usage: result.usage,
          providerMetadata: result.providerMetadata,
        },
      }
    },
  }
}
