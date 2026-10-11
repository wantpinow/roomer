import type { Point } from "../geometry/angles"
import { formatNumber } from "../geometry/format"
import type { Bounds2 } from "../geometry/polygon"
import type { RoomGeometry } from "../geometry/room-geometry"
import { findWall } from "../geometry/walls"
import type { AssetSpec, LintReport, Placement } from "../schema"
import { planContext, type PlanContext } from "./context"
import { drawDimensions } from "./dimensions"
import {
  drawFeatureIds,
  drawFloorFeatures,
  drawOverhead,
  drawWallFixtures,
  drawWallObstacles,
  featureDefs,
  overheadLabelObstacles,
} from "./features"
import { drawItemLabels, drawItems, planItems } from "./furniture"
import { LabelSpace } from "./labels"
import { drawHighlights, drawLintOverlay } from "./overlay"
import { el, num, ringsPath, text } from "./svg"
import { resolveTheme, type PlanTheme } from "./theme"
import { doorLeaves, drawOpenings, drawWalls } from "./walls"

// The floor plan as a standalone SVG string (spec §8): an architect-style
// drawing in millimetres (the viewBox is in mm, so it's crisp at any size)
// with walls, doors and windows, fixtures, furniture with labels and facing
// ticks, dimensions, and an optional lint overlay. Interactive UIs hook onto
// `data-placement-id` / `data-feature-id` / `data-wall-id`. Pure and
// deterministic: the same input always gives the same string.

export { DEFAULT_PLAN_THEME, type PlanTheme } from "./theme"

export interface PlanSvgOptions {
  /** Output width in px; height follows the room's aspect ratio. Default 1200. */
  width?: number
  title?: string
  /** Wall lengths, corner ids and angles. Default true. */
  showDimensions?: boolean
  /** Item names and feature ids. Default true. */
  showLabels?: boolean
  /** Placement or feature ids to emphasise (e.g. the current selection). */
  highlight?: readonly string[]
  /** Override any colour or the font (e.g. with the web app's tokens). */
  theme?: Partial<PlanTheme>
  /** Prefix for ids in <defs>; set it when several plans share a page. */
  idPrefix?: string
}

export interface PlanSvgInput {
  room: RoomGeometry
  placements?: readonly Placement[]
  /** Asset specs keyed by `placement.assetId`. */
  assets?: Readonly<Record<string, AssetSpec>>
  lint?: LintReport
  options?: PlanSvgOptions
}

export const DEFAULT_PLAN_WIDTH_PX = 1200

function mergeBounds(a: Bounds2, b: Bounds2): Bounds2 {
  return {
    minX: Math.min(a.minX, b.minX),
    minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX),
    maxZ: Math.max(a.maxZ, b.maxZ),
  }
}

function pointsBounds(points: readonly Point[]): Bounds2 {
  return {
    minX: Math.min(...points.map((p) => p[0])),
    minZ: Math.min(...points.map((p) => p[1])),
    maxX: Math.max(...points.map((p) => p[0])),
    maxZ: Math.max(...points.map((p) => p[1])),
  }
}

/** A 0–1m (or 0–2m) bar with alternating quarters. */
function scaleBar(ctx: PlanContext, at: Point): string {
  const { theme, metrics } = ctx
  const roomWidth = ctx.bounds.maxX - ctx.bounds.minX
  const length = roomWidth >= 4000 ? 2000 : 1000
  const height = metrics.small * 0.45
  const quarter = length / 4
  const blocks = [0, 1, 2, 3].map((i) =>
    el("rect", {
      x: at[0] + i * quarter,
      y: at[1],
      width: quarter,
      height,
      fill: i % 2 === 0 ? theme.dimension : theme.paper,
      stroke: theme.dimension,
      "stroke-width": metrics.hairline,
    })
  )
  const label = (x: number, content: string) =>
    el(
      "text",
      {
        x,
        y: at[1] + height + metrics.small * 1.15,
        "font-size": metrics.small,
        "text-anchor": "middle",
        fill: theme.mutedText,
      },
      text(content)
    )
  return el("g", { class: "scale-bar" }, [
    ...blocks,
    label(at[0], "0"),
    label(at[0] + length, `${length / 1000} m`),
  ])
}

function titleBlock(ctx: PlanContext, title: string, at: Point): string {
  const { theme, metrics, bounds } = ctx
  const width = Math.round(bounds.maxX - bounds.minX)
  const depth = Math.round(bounds.maxZ - bounds.minZ)
  return el("g", { class: "title" }, [
    el(
      "text",
      {
        x: at[0],
        y: at[1] + metrics.title,
        "font-size": metrics.title,
        "font-weight": 600,
        fill: theme.text,
      },
      text(title)
    ),
    el(
      "text",
      {
        x: at[0],
        y: at[1] + metrics.title + metrics.small * 1.7,
        "font-size": metrics.small,
        fill: theme.mutedText,
        "letter-spacing": metrics.small * 0.04,
      },
      text(
        `${formatNumber(width)} × ${formatNumber(depth)} mm · ceiling ${formatNumber(ctx.room.ceilingHeight)} mm`
      )
    ),
  ])
}

/** Label space with the overhead fittings already taken. */
function labelSpace(ctx: PlanContext): LabelSpace {
  const space = new LabelSpace()
  for (const box of overheadLabelObstacles(ctx)) space.add(box)
  return space
}

export function planSvg(input: PlanSvgInput): string {
  const options = input.options ?? {}
  const theme = resolveTheme(options.theme)
  const ctx = planContext(input.room, theme, options.idPrefix ?? "roomer-plan")
  const { metrics } = ctx
  const showLabels = options.showLabels ?? true
  const showDimensions = options.showDimensions ?? true
  const highlight = new Set(options.highlight ?? [])
  const items = planItems(input.placements ?? [], input.assets ?? {})

  const ids = showLabels ? drawFeatureIds(ctx) : { svg: "", lanes: 0 }
  const dims = showDimensions
    ? drawDimensions(ctx, ids.lanes)
    : { svg: "", box: pointsBounds(ctx.outer) }

  let content = mergeBounds(dims.box, pointsBounds(ctx.outer))
  if (ids.lanes > 0) {
    const reach = metrics.wall + metrics.gap + ids.lanes * metrics.lane
    content = mergeBounds(content, {
      minX: ctx.bounds.minX - reach,
      minZ: ctx.bounds.minZ - reach,
      maxX: ctx.bounds.maxX + reach,
      maxZ: ctx.bounds.maxZ + reach,
    })
  }
  for (const item of items) content = mergeBounds(content, item.bounds)
  // Doors that swing out reach beyond the walls.
  for (const feature of ctx.room.features) {
    if (feature.type !== "door" || feature.swing !== "out") continue
    const wall = findWall(ctx.walls, feature.wall)
    if (!wall) continue
    for (const leaf of doorLeaves(wall, feature)) {
      const reach = leaf.radius + metrics.wall
      content = mergeBounds(content, {
        minX: leaf.hinge[0] - reach,
        minZ: leaf.hinge[1] - reach,
        maxX: leaf.hinge[0] + reach,
        maxZ: leaf.hinge[1] + reach,
      })
    }
  }

  const margin = metrics.font * 1.5
  const title = options.title?.trim()
  const titleHeight = title ? metrics.title + metrics.small * 3.2 : 0
  const footer = metrics.small * 3.4
  const view = {
    x: content.minX - margin,
    y: content.minZ - margin - titleHeight,
    width: content.maxX - content.minX + 2 * margin,
    height: content.maxZ - content.minZ + 2 * margin + titleHeight + footer,
  }
  const widthPx = options.width ?? DEFAULT_PLAN_WIDTH_PX
  const heightPx = (widthPx * view.height) / view.width

  const layers = [
    el("rect", {
      class: "paper",
      x: view.x,
      y: view.y,
      width: view.width,
      height: view.height,
      fill: theme.paper,
    }),
    el("path", {
      class: "floor",
      d: ringsPath([ctx.polygon]),
      fill: theme.floor,
    }),
    drawFloorFeatures(ctx),
    drawWallFixtures(ctx),
    drawItems(ctx, items),
    drawOverhead(ctx),
    drawWallObstacles(ctx),
    drawWalls(ctx),
    drawOpenings(ctx),
    ids.svg,
    dims.svg,
    showLabels ? drawItemLabels(ctx, items, labelSpace(ctx)) : "",
    drawHighlights(ctx, items, highlight),
    drawLintOverlay(ctx, items, input.lint),
    title
      ? titleBlock(ctx, title, [view.x + margin, view.y + margin * 0.6])
      : "",
    scaleBar(ctx, [
      view.x + margin,
      view.y + view.height - footer - margin * 0.2,
    ]),
  ]

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `${num(view.x)} ${num(view.y)} ${num(view.width)} ${num(view.height)}`,
      width: Math.round(widthPx),
      height: Math.round(heightPx),
      role: "img",
      "aria-label": title ?? "Floor plan",
      "font-family": theme.fontFamily,
      "stroke-linecap": "butt",
    },
    [
      title ? el("title", {}, text(title)) : "",
      el("defs", {}, featureDefs(ctx)),
      ...layers,
    ]
  )
}
