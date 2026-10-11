import { PNG } from "pngjs"

import type { ImageRenderRequest, ImageRenderer } from "../types"

/** A solid-colour PNG for tests. */
export function solidPng(
  width: number,
  height: number,
  [r, g, b]: readonly [number, number, number] = [200, 200, 200]
): Buffer {
  const png = new PNG({ width, height })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r
    png.data[i + 1] = g
    png.data[i + 2] = b
    png.data[i + 3] = 255
  }
  return PNG.sync.write(png)
}

/** A renderer that records its requests and answers with `output`. */
export function fakeRenderer(
  overrides: Partial<
    Pick<ImageRenderer, "id" | "maxInputImages" | "prefersIdPass">
  > = {},
  output: Buffer = solidPng(4, 4, [10, 20, 30])
): ImageRenderer & { requests: ImageRenderRequest[] } {
  const requests: ImageRenderRequest[] = []
  return {
    id: overrides.id ?? "openai/gpt-image-2.5-sunburst",
    maxInputImages: overrides.maxInputImages ?? 16,
    prefersIdPass: overrides.prefersIdPass ?? true,
    requests,
    async render(request) {
      requests.push(request)
      return { png: output, raw: { fake: true } }
    },
  }
}
