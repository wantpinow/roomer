import type { RenderPass } from "@roomer/core"
import type { CanvasProps } from "@react-three/fiber"
import { PCFShadowMap } from "three"

// Renderer settings per pass. Clay wants antialiasing, soft shadows and the
// post-processing chain (which does its own tone mapping). The id and depth
// passes want exact bytes: no antialiasing, no tone mapping and a linear
// output colour space (their materials store colours as linear values).

export type PassCanvasProps = Pick<
  CanvasProps,
  "gl" | "flat" | "linear" | "shadows"
>

export function passCanvasProps(
  pass: RenderPass,
  { preserveDrawingBuffer = false }: { preserveDrawingBuffer?: boolean } = {}
): PassCanvasProps {
  if (pass === "clay") {
    return {
      gl: { antialias: true, alpha: false, preserveDrawingBuffer },
      shadows: { enabled: true, type: PCFShadowMap },
      flat: false,
      linear: false,
    }
  }
  return {
    gl: { antialias: false, alpha: false, preserveDrawingBuffer },
    shadows: false,
    flat: true,
    linear: true,
  }
}
