import { renderAsync } from "@resvg/resvg-js"
import type { Aabb3 } from "@roomer/core/assets"
import sharp from "sharp"

import { designTokens } from "@/lib/design-tokens"
import type { AssetPreviewView } from "@/lib/scene/types"
import { assetViewSetup, cameraBasis, type Vec3 } from "@/lib/scene/views"

import { pngSize } from "../render/png"

// Pictures composed for the agent, server-side: product photos normalised
// to PNG (retailers send WebP, AVIF, JPEG or PNG under any extension), an
// orientation marker on the top and iso clay previews, and one "comparison
// sheet" putting the product photo(s) beside the clay front and iso views,
// so a single image answers "does the model look like the product?".
// Layout is SVG (embedded PNGs, labels) rasterised by resvg, like the plan.

/** Longest side of a photo returned to the agent, px. */
export const PHOTO_MAX_SIDE = 1024
/** Each picture on a comparison sheet is fitted into a square this size. */
export const SHEET_CELL = 480
const SHEET_GAP = 16
const SHEET_LABEL = 34
const SHEET_HEADER = 48

const palette = designTokens.plan.light
const INK = palette.labelText
const MUTED = palette.labelMuted
const PAPER = palette.paper
const ACCENT = palette.furnitureSelectedStroke
const FONT = "Helvetica, Arial, sans-serif"

/** Any image the photo downloader accepts, as a PNG within maxSide², on white. */
export async function photoToPng(
  data: Buffer,
  maxSide: number = PHOTO_MAX_SIDE
): Promise<Buffer> {
  return await sharp(data, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
}

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const dataUrl = (png: Buffer): string =>
  `data:image/png;base64,${png.toString("base64")}`

async function rasterise(svg: string): Promise<Buffer> {
  const image = await renderAsync(svg, {
    fitTo: { mode: "original" },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: "Helvetica",
      sansSerifFamily: "Helvetica",
    },
    shapeRendering: 2,
    textRendering: 1,
  })
  return image.asPng()
}

// --- orientation marker ------------------------------------------------------

/** Views that get a marker: the ones where front and sides are ambiguous. */
export const MARKED_VIEWS: readonly AssetPreviewView[] = ["top", "iso"]

interface MarkerAxis {
  label: string
  /** Item-local direction. */
  direction: Vec3
  colour: string
  bold: boolean
}

const MARKER_AXES: MarkerAxis[] = [
  { label: "x", direction: [1, 0, 0], colour: INK, bold: false },
  { label: "front +z", direction: [0, 0, 1], colour: ACCENT, bold: true },
  { label: "y", direction: [0, 1, 0], colour: MUTED, bold: false },
]

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Screen directions (x right, y down, unit = full length) of the item's
 * axes in a preview, from the same camera the preview was rendered with.
 * Axes pointing at the camera (shorter than 0.2) are left out.
 */
export function markerArrows(
  view: AssetPreviewView,
  bounds: Aabb3,
  aspect: number
): { label: string; dx: number; dy: number; colour: string; bold: boolean }[] {
  const setup = assetViewSetup(view, bounds, aspect)
  const forward: Vec3 = [
    setup.target[0] - setup.position[0],
    setup.target[1] - setup.position[1],
    setup.target[2] - setup.position[2],
  ]
  const { right, up } = cameraBasis(forward, setup.up)
  return MARKER_AXES.flatMap((axis) => {
    const dx = dot(axis.direction, right)
    const dy = -dot(axis.direction, up)
    if (Math.hypot(dx, dy) < 0.2) return []
    return [{ label: axis.label, dx, dy, colour: axis.colour, bold: axis.bold }]
  })
}

/** The marker's SVG: a small panel in the bottom-left corner, sized to fit. */
export function markerSvg(
  arrows: ReturnType<typeof markerArrows>,
  height: number
): string {
  const length = 40
  const head = 8
  const pad = 12
  const margin = 16
  // Lay the arrows out around (0, 0) first, labels just beyond the tips
  // (13px text is about 7.5px a character), then fit a panel round them.
  const laid = arrows.map((arrow) => {
    const tx = arrow.dx * length
    const ty = arrow.dy * length
    const norm = Math.hypot(arrow.dx, arrow.dy) || 1
    const [ux, uy] = [arrow.dx / norm, arrow.dy / norm]
    const anchor = ux > 0.3 ? "start" : ux < -0.3 ? "end" : "middle"
    const width = arrow.label.length * 7.5
    const lx = tx + ux * 10
    const ly = ty + uy * 12 + (uy > 0.3 ? 8 : 4)
    const left =
      anchor === "end" ? lx - width : anchor === "middle" ? lx - width / 2 : lx
    return { arrow, tx, ty, ux, uy, anchor, lx, ly, left, right: left + width }
  })
  const xs = [0, ...laid.flatMap((a) => [a.tx, a.left, a.right])]
  const ys = [0, ...laid.flatMap((a) => [a.ty, a.ly - 11, a.ly + 3])]
  const minX = Math.min(...xs) - pad
  const maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad
  const maxY = Math.max(...ys) + pad
  const panelW = Math.max(110, maxX - minX)
  const panelH = Math.max(90, maxY - minY)
  const x0 = margin
  const y0 = height - margin - panelH
  // Origin so the drawing sits centred in the panel.
  const ox = x0 + (panelW - (maxX - minX)) / 2 - minX
  const oy = y0 + (panelH - (maxY - minY)) / 2 - minY
  const parts = [
    `<rect x="${x0}" y="${y0}" width="${panelW}" height="${panelH}" rx="10" fill="#ffffff" fill-opacity="0.85" stroke="${MUTED}" stroke-opacity="0.5"/>`,
    `<circle cx="${ox}" cy="${oy}" r="3" fill="${INK}"/>`,
  ]
  for (const { arrow, tx, ty, ux, uy, anchor, lx, ly } of laid) {
    const [px, py] = [ox + tx, oy + ty]
    const stroke = arrow.bold ? 3 : 2
    const left = `${px - ux * head - uy * head * 0.5},${py - uy * head + ux * head * 0.5}`
    const right = `${px - ux * head + uy * head * 0.5},${py - uy * head - ux * head * 0.5}`
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${px - ux * head * 0.6}" y2="${py - uy * head * 0.6}" stroke="${arrow.colour}" stroke-width="${stroke}" stroke-linecap="round"/>`,
      `<polygon points="${px},${py} ${left} ${right}" fill="${arrow.colour}"/>`,
      `<text x="${ox + lx}" y="${oy + ly}" font-family="${FONT}" font-size="13" font-weight="${arrow.bold ? 700 : 500}" fill="${arrow.colour}" text-anchor="${anchor}">${escapeXml(arrow.label)}</text>`
    )
  }
  return `<g class="orientation">${parts.join("")}</g>`
}

/**
 * The preview with an orientation marker (the item's x, front (+z) and up
 * axes as the camera sees them) in its bottom-left corner. Views other than
 * top and iso come back unchanged.
 */
export async function markOrientation(
  png: Buffer,
  view: AssetPreviewView,
  bounds: Aabb3
): Promise<Buffer> {
  if (!MARKED_VIEWS.includes(view)) return png
  const { width, height } = pngSize(png)
  const arrows = markerArrows(view, bounds, width / height)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="${dataUrl(png)}" x="0" y="0" width="${width}" height="${height}"/>`,
    markerSvg(arrows, height),
    "</svg>",
  ].join("")
  return await rasterise(svg)
}

// --- comparison sheet --------------------------------------------------------

export interface SheetImage {
  png: Buffer
  label: string
}

/**
 * Product photos beside clay views, labelled, on one image: one row when
 * there are three pictures or fewer, otherwise photos above and clay below.
 * Each picture is fitted into a SHEET_CELL square without cropping.
 */
export async function comparisonSheet({
  title,
  photos,
  clay,
}: {
  title: string
  photos: readonly SheetImage[]
  clay: readonly SheetImage[]
}): Promise<Buffer> {
  const rows: (readonly SheetImage[])[] =
    photos.length + clay.length <= 3 ? [[...photos, ...clay]] : [photos, clay]
  const columns = Math.max(...rows.map((row) => row.length))
  const width = columns * SHEET_CELL + (columns + 1) * SHEET_GAP
  const rowHeight = SHEET_LABEL + SHEET_CELL
  const height =
    SHEET_HEADER + rows.length * rowHeight + (rows.length + 1) * SHEET_GAP
  const cells: string[] = []
  rows.forEach((row, r) => {
    row.forEach((image, c) => {
      const x = SHEET_GAP + c * (SHEET_CELL + SHEET_GAP)
      const y = SHEET_HEADER + SHEET_GAP + r * (rowHeight + SHEET_GAP)
      cells.push(
        `<text x="${x}" y="${y + 22}" font-family="${FONT}" font-size="16" font-weight="600" letter-spacing="0.4" fill="${INK}">${escapeXml(image.label)}</text>`,
        `<rect x="${x}" y="${y + SHEET_LABEL}" width="${SHEET_CELL}" height="${SHEET_CELL}" fill="#ffffff" stroke="${MUTED}" stroke-opacity="0.45"/>`,
        `<image href="${dataUrl(image.png)}" x="${x}" y="${y + SHEET_LABEL}" width="${SHEET_CELL}" height="${SHEET_CELL}" preserveAspectRatio="xMidYMid meet"/>`
      )
    })
  })
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${PAPER}"/>`,
    `<text x="${SHEET_GAP}" y="32" font-family="${FONT}" font-size="20" font-weight="700" fill="${INK}">${escapeXml(title)}</text>`,
    ...cells,
    "</svg>",
  ].join("")
  return await rasterise(svg)
}
