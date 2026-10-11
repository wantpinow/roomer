import "server-only"

import { getRoomerApi } from "../convex"
import { getConfiguredImageRenderer } from "../photoreal/server"
import { renderAssetPreviews, renderScene } from "../render/renderer"

import type { PipelineDeps } from "./deps"

/** The real dependencies: Convex over HTTP, headless Chromium, AI Gateway. */
export function liveDeps(): PipelineDeps {
  return {
    api: getRoomerApi(),
    renderer: { renderScene, renderAssetPreviews },
    photoreal: { renderer: getConfiguredImageRenderer },
    now: () => Date.now(),
  }
}
