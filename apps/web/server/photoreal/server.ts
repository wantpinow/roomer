import "server-only"

import { DEFAULT_PHOTOREAL_MODEL, type PhotorealModel } from "@roomer/core"

import { env } from "@/env"

import { getImageRenderer } from "./renderers"
import type { ImageRenderer } from "./types"

// The one place the photoreal module reads secrets: the AI Gateway key and
// the stub switch come from env (repo-root .env.local via load-root-env).
// Everything else in server/photoreal takes them as arguments, so tests and
// scripts never need Next's env.

export function getConfiguredImageRenderer(
  model: PhotorealModel = DEFAULT_PHOTOREAL_MODEL
): ImageRenderer {
  return getImageRenderer(model, {
    stub: env.PHOTOREAL_STUB === "1",
    ...(env.AI_GATEWAY_API_KEY ? { apiKey: env.AI_GATEWAY_API_KEY } : {}),
  })
}
