import { renderAsync, type ResvgRenderOptions } from "@resvg/resvg-js"

// Floor-plan SVG → PNG with resvg (native, off the event loop). Plans are
// returned to the agent as images, so the longest side is capped: a 7.7m ×
// 3m room at a fixed width would be a needlessly tall image.

export const DEFAULT_PLAN_MAX_SIDE = 1400
export const MIN_PLAN_SIDE = 200
export const MAX_PLAN_SIDE = 4000

/** The SVG's intrinsic size: viewBox first, else width/height attributes. */
export function svgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0]
  if (!root) throw new Error("Not an SVG document")
  const viewBox = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(root)?.[1]
  if (viewBox) {
    const [, , width, height] = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    if (width && height && width > 0 && height > 0) return { width, height }
  }
  const attribute = (name: string) => {
    const value = new RegExp(`\\b${name}\\s*=\\s*["']([\\d.]+)`, "i").exec(
      root
    )?.[1]
    return value ? Number(value) : undefined
  }
  const width = attribute("width")
  const height = attribute("height")
  if (width && height) return { width, height }
  throw new Error("The SVG has neither a viewBox nor a width and height")
}

/** Scale to fit so the longest side is exactly `maxSide` pixels. */
export function fitLongestSide(
  size: { width: number; height: number },
  maxSide: number
): NonNullable<ResvgRenderOptions["fitTo"]> {
  const side = Math.round(
    Math.min(Math.max(maxSide, MIN_PLAN_SIDE), MAX_PLAN_SIDE)
  )
  return size.width >= size.height
    ? { mode: "width", value: side }
    : { mode: "height", value: side }
}

export async function rasterisePlan(
  svg: string,
  {
    maxSide = DEFAULT_PLAN_MAX_SIDE,
    background,
  }: { maxSide?: number; background?: string } = {}
): Promise<Buffer> {
  const image = await renderAsync(svg, {
    fitTo: fitLongestSide(svgSize(svg), maxSide),
    font: {
      loadSystemFonts: true,
      defaultFontFamily: "Helvetica",
      sansSerifFamily: "Helvetica",
    },
    shapeRendering: 2,
    textRendering: 1,
    ...(background ? { background } : {}),
  })
  return image.asPng()
}
