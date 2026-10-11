import type {
  PhotorealModel,
  RenderQuality,
  RenderSize,
} from "@roomer/core/schema"

// The seam between the photoreal pipeline and the image models (spec §8,
// architecture §5). The pipeline builds a prompt and an ordered list of input
// images; an `ImageRenderer` turns them into one PNG. Implementations live in
// ./renderers — one per AI Gateway API family, plus a free stub for e2e.

/** What an input image is for; the prompt refers to images by position. */
export type InputImageRole = "clay" | "id" | "reference"

export interface InputImage {
  role: InputImageRole
  /** Encoded image bytes (PNG for the passes; PNG/JPEG/WebP for references). */
  data: Buffer
  /** Media type of `data`, e.g. "image/png". */
  mime: string
  /** Human label, e.g. "clay render" or "reference: Auburn 3 seater sofa". */
  label: string
}

/** An input image without its bytes — what a render record keeps. */
export type InputImageMeta = Omit<InputImage, "data"> & { bytes: number }

export interface ImageRenderRequest {
  prompt: string
  /** In prompt order: image 1 first. */
  images: InputImage[]
  /** Output size; renderers map it to what their model accepts. */
  size: RenderSize | "auto"
  quality: RenderQuality
  signal?: AbortSignal
}

export interface ImageRenderResult {
  /** The output image, always PNG. */
  png: Buffer
  /** Provider metadata (usage, cost, warnings) for logs and the spike. */
  raw?: unknown
}

export interface ImageRenderer {
  id: PhotorealModel
  /** Most input images the model accepts (passes + references). */
  maxInputImages: number
  render(request: ImageRenderRequest): Promise<ImageRenderResult>
}

export function toInputImageMeta(image: InputImage): InputImageMeta {
  return {
    role: image.role,
    mime: image.mime,
    label: image.label,
    bytes: image.data.byteLength,
  }
}
