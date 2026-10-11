import type { RenderQuality, RenderSize } from "@roomer/core/schema"

// Each image API sizes its output differently. The pipeline asks for an exact
// pixel size (normally the clay pass's); these helpers turn that into what
// each model accepts. Limits verified against the AI Gateway on 2026-10-11.

/** gpt-image-2.5: both sides divisible by 16 … */
const OPENAI_SIDE_STEP = 16
/** … and at least this many pixels ("minimum pixel budget"; 768×512 fails). */
export const OPENAI_MIN_PIXELS = 655_360

const ceilTo = (value: number, step: number) => Math.ceil(value / step) * step
const roundTo = (value: number, step: number) =>
  Math.max(step, Math.round(value / step) * step)

/**
 * The closest size gpt-image-2.5 accepts with the same aspect ratio:
 * sides rounded to multiples of 16, scaled up to the minimum pixel budget.
 * `undefined` means "auto" (let the model choose).
 */
export function openAIImageSize(
  size: RenderSize | "auto"
): `${number}x${number}` | undefined {
  if (size === "auto") return undefined
  const { width, height } = size
  const scale = Math.max(1, Math.sqrt(OPENAI_MIN_PIXELS / (width * height)))
  let w = roundTo(width * scale, OPENAI_SIDE_STEP)
  let h = roundTo(height * scale, OPENAI_SIDE_STEP)
  if (w * h < OPENAI_MIN_PIXELS) {
    w = ceilTo(width * scale, OPENAI_SIDE_STEP)
    h = ceilTo(height * scale, OPENAI_SIDE_STEP)
  }
  return `${w}x${h}`
}

/** Aspect ratios Gemini image models accept (FLUX accepts these too). */
export const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const

export type SupportedAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number]

function ratioValue(ratio: SupportedAspectRatio): number {
  const [w, h] = ratio.split(":").map(Number)
  return w! / h!
}

/** The supported ratio closest to `size` (compared in log space). */
export function nearestAspectRatio(
  size: RenderSize | "auto"
): SupportedAspectRatio | undefined {
  if (size === "auto") return undefined
  const target = Math.log(size.width / size.height)
  let best: SupportedAspectRatio = "1:1"
  let bestError = Infinity
  for (const ratio of SUPPORTED_ASPECT_RATIOS) {
    const error = Math.abs(Math.log(ratioValue(ratio)) - target)
    if (error < bestError) {
      best = ratio
      bestError = error
    }
  }
  return best
}

/** Gemini output resolution class per quality (1K ≈ 1264×848 at 3:2). */
export const GEMINI_IMAGE_SIZE = {
  low: "1K",
  medium: "2K",
  high: "4K",
} as const satisfies Record<RenderQuality, string>
