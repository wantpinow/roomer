import type { PhotorealModel } from "@roomer/core/schema"

import type {
  AssetPreviewView,
  RenderAssetScene,
  RenderScene,
} from "@/lib/scene/types"

import type { RoomerApi } from "../convex"
import type { ImageRenderer } from "../photoreal/types"

// What the pipelines (and the MCP tools on top of them) need from the
// outside world, as interfaces: Convex, the headless scene renderer, the
// image models and a clock. `live-deps.ts` wires the real ones; tests pass
// fakes.

export interface SceneRenderer {
  /** One pass of a room scene, PNG bytes at exactly width × height. */
  renderScene(scene: RenderScene): Promise<Buffer>
  /** Clay previews of one asset, one PNG per view. */
  renderAssetPreviews(
    asset: RenderAssetScene["asset"],
    views?: readonly AssetPreviewView[],
    size?: { width: number; height: number }
  ): Promise<{ view: AssetPreviewView; png: Buffer }[]>
}

export interface PhotorealProvider {
  /**
   * The image renderer for `model` (the stub when PHOTOREAL_STUB=1). Throws
   * a PhotorealError when the model can't run (e.g. no API key).
   */
  renderer(model: PhotorealModel): ImageRenderer
}

export interface PipelineDeps {
  api: RoomerApi
  renderer: SceneRenderer
  photoreal: PhotorealProvider
  /** Wall clock, ms (durations). */
  now: () => number
}
