import { assetLocalBounds, type Aabb3 } from "../assets/bounds"
import type { Point } from "../geometry/angles"
import { bounds, type Bounds2 } from "../geometry/polygon"
import {
  placementTransform,
  type PlacementTransform,
} from "../geometry/transform"
import { union } from "../lint/polygons"
import { worldShapes } from "../placement/world"
import type { AssetSpec, Placement } from "../schema"
import type { PlanContext } from "./context"
import {
  fitLabel,
  labelBounds,
  LabelSpace,
  LINE_HEIGHT_EM,
  type LabelFit,
} from "./labels"
import {
  el,
  linePath,
  num,
  placeAt,
  ringsPath,
  text,
  uprightAngle,
} from "./svg"

// Furniture: each part's footprint painted from the lowest part up (so the
// view from above comes out right — a sofa's cushions over its base, a table
// top hiding its legs), the union of all parts as the item's outline, and a
// small chevron at the front so facing reads at a glance. Rugs go first,
// lighter and dashed; ceiling items last, dashed because they're overhead.

export interface PlanItem {
  placement: Placement
  asset: AssetSpec
  name: string
  parts: { footprint: Point[]; y1: number }[]
  /** Union of the part footprints: polygons with holes. */
  outline: Point[][][]
  bounds: Bounds2
  local: Aabb3
  transform: PlacementTransform
  top: number
}

const MOUNT_ORDER = { "floor-covering": 0, floor: 1, wall: 2, ceiling: 3 }

export function planItems(
  placements: readonly Placement[],
  assets: Readonly<Record<string, AssetSpec>>
): PlanItem[] {
  const items: PlanItem[] = []
  for (const placement of placements) {
    const asset = assets[placement.assetId]
    if (!asset) continue
    const shapes = worldShapes(placement, asset)
    const parts = shapes
      .map((s) => ({ footprint: s.footprint, y1: s.y1 }))
      .filter((p) => p.footprint.length >= 3)
    if (parts.length === 0) continue
    items.push({
      placement,
      asset,
      name: placement.label ?? asset.name,
      parts,
      outline: union(parts.map((p) => p.footprint)),
      bounds: bounds(parts.flatMap((p) => p.footprint)),
      local: assetLocalBounds(asset),
      transform: placementTransform(placement),
      top: Math.max(...shapes.map((s) => s.y1)),
    })
  }
  // Rugs first, then floor items (chairs before the tables they tuck
  // under, lower before higher), wall items, ceiling items.
  return items.sort(
    (a, b) =>
      MOUNT_ORDER[a.asset.mount] - MOUNT_ORDER[b.asset.mount] ||
      Number(b.asset.category === "chair") -
        Number(a.asset.category === "chair") ||
      a.top - b.top ||
      (a.placement.id < b.placement.id ? -1 : 1)
  )
}

function frontChevron(ctx: PlanContext, item: PlanItem): string {
  const { min, max } = item.local
  const width = max[0] - min[0]
  const depth = max[2] - min[2]
  const s = Math.min(70, 0.14 * Math.min(width, depth))
  if (s < 12) return ""
  const cx = (min[0] + max[0]) / 2
  const t = item.transform
  return el("path", {
    class: "front",
    d: linePath([
      t.toPlan(cx - s, max[2] - s * 1.35),
      t.toPlan(cx, max[2] - s * 0.45),
      t.toPlan(cx + s, max[2] - s * 1.35),
    ]),
    fill: "none",
    stroke: ctx.theme.furnitureStroke,
    "stroke-width": ctx.metrics.hairline * 1.6,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })
}

function drawItem(ctx: PlanContext, item: PlanItem): string {
  const { theme, metrics } = ctx
  const outline = item.outline.map((polygon) => ringsPath(polygon)).join("")
  const attrs = {
    class: `item ${item.asset.mount}`,
    "data-id": item.placement.id,
    "data-placement-id": item.placement.id,
    "data-asset-id": item.placement.assetId,
  }
  const dashed = `${num(metrics.hairline * 6)} ${num(metrics.hairline * 4)}`
  if (item.asset.mount === "floor-covering") {
    return el("g", attrs, [
      el("path", {
        d: outline,
        fill: theme.coveringFill,
        stroke: theme.coveringStroke,
        "stroke-width": metrics.hairline * 1.5,
        "stroke-dasharray": dashed,
        "fill-rule": "evenodd",
      }),
    ])
  }
  if (item.asset.mount === "ceiling") {
    return el("g", attrs, [
      el("path", {
        d: outline,
        fill: "none",
        stroke: theme.furnitureStroke,
        "stroke-width": metrics.hairline * 1.5,
        "stroke-dasharray": dashed,
        "fill-rule": "evenodd",
      }),
    ])
  }
  const parts = [...item.parts]
    .sort((a, b) => a.y1 - b.y1)
    .map((part) =>
      el("path", {
        d: ringsPath([part.footprint]),
        fill: theme.furnitureFill,
        stroke: theme.furnitureDetail,
        "stroke-width": metrics.hairline,
        "stroke-linejoin": "round",
      })
    )
  return el("g", attrs, [
    ...parts,
    el("path", {
      class: "outline",
      d: outline,
      fill: "none",
      stroke: theme.furnitureStroke,
      "stroke-width": metrics.stroke,
      "stroke-linejoin": "round",
      "fill-rule": "evenodd",
    }),
    frontChevron(ctx, item),
  ])
}

export function drawItems(ctx: PlanContext, items: readonly PlanItem[]) {
  return el(
    "g",
    { class: "furniture" },
    items.map((item) => drawItem(ctx, item))
  )
}

interface LabelPlan {
  item: PlanItem
  fit: LabelFit
  direction: Point
}

function axis(t: PlacementTransform, lx: number, lz: number): Point {
  const o = t.toPlan(0, 0)
  const p = t.toPlan(lx, lz)
  return [p[0] - o[0], p[1] - o[1]]
}

function planLabel(ctx: PlanContext, item: PlanItem): LabelPlan | undefined {
  const { min, max } = item.local
  const width = max[0] - min[0]
  const depth = max[2] - min[2]
  const pad = Math.min(50, 0.08 * Math.min(width, depth))
  const first = axis(item.transform, 1, 0)
  const second = axis(item.transform, 0, 1)
  const rug = item.asset.mount === "floor-covering"
  const max_ = ctx.metrics.font * (rug ? 0.85 : 1)
  const fit = fitLabel(
    item.name,
    {
      first: width - 2 * pad,
      second: depth - 2 * pad,
      firstIsHorizontal: Math.abs(first[0]) >= Math.abs(first[1]),
    },
    max_,
    ctx.metrics.minFont
  )
  if (!fit) return undefined
  return { item, fit, direction: fit.alongSecond ? second : first }
}

/**
 * Where a label may go: its item's middle first, then further along the
 * item, then just beyond it (nearest the middle of the room first).
 */
function candidates(
  ctx: PlanContext,
  item: PlanItem,
  fit: LabelFit,
  direction: Point
): { inside: Point[]; outside: Point[] } {
  const { min, max } = item.local
  const t = item.transform
  const cx = (min[0] + max[0]) / 2
  const cz = (min[2] + max[2]) / 2
  const width = max[0] - min[0]
  const depth = max[2] - min[2]
  const height = fit.lines.length * LINE_HEIGHT_EM * fit.size
  const inside: Point[] = fit.outside
    ? []
    : [
        t.toPlan(cx, cz),
        ...(width >= depth
          ? [t.toPlan(cx - width * 0.25, cz), t.toPlan(cx + width * 0.25, cz)]
          : [t.toPlan(cx, cz - depth * 0.25), t.toPlan(cx, cz + depth * 0.25)]),
        t.toPlan(cx, cz + depth * 0.3),
        t.toPlan(cx, cz - depth * 0.3),
      ]
  const box = item.bounds
  const mid: Point = [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2]
  const gap = height * 0.75
  const horizontal = Math.abs(direction[0]) >= Math.abs(direction[1])
  const outside: Point[] = horizontal
    ? [
        [mid[0], box.maxZ + gap],
        [mid[0], box.minZ - gap],
      ]
    : [
        [box.maxX + gap, mid[1]],
        [box.minX - gap, mid[1]],
      ]
  const centre: Point = [
    (ctx.bounds.minX + ctx.bounds.maxX) / 2,
    (ctx.bounds.minZ + ctx.bounds.maxZ) / 2,
  ]
  const distance = (p: Point) => Math.hypot(p[0] - centre[0], p[1] - centre[1])
  outside.sort((a, b) => distance(a) - distance(b))
  return { inside, outside }
}

export function drawItemLabels(
  ctx: PlanContext,
  items: readonly PlanItem[],
  space: LabelSpace
): string {
  const { theme } = ctx
  const area = (item: PlanItem) =>
    (item.local.max[0] - item.local.min[0]) *
    (item.local.max[2] - item.local.min[2])
  const rank = (item: PlanItem) =>
    item.asset.mount === "floor-covering"
      ? 3
      : item.asset.mount === "ceiling"
        ? 2
        : item.asset.mount === "wall"
          ? 1
          : 0
  const ordered = [...items].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      area(b) - area(a) ||
      (a.placement.id < b.placement.id ? -1 : 1)
  )
  const solid = items
    .filter((i) => i.asset.mount !== "floor-covering")
    .map((i) => ({ id: i.placement.id, bounds: i.bounds }))
  const parts: string[] = []
  for (const item of ordered) {
    const plan = planLabel(ctx, item)
    if (!plan) continue
    const rug = item.asset.mount === "floor-covering"
    // Rugs lie under furniture: keep their label off it.
    const avoid = rug ? solid.map((s) => s.bounds) : []
    const { inside: within, outside } = candidates(
      ctx,
      item,
      plan.fit,
      plan.direction
    )
    const options = [...within, ...outside]
    const insideCount = within.length
    let chosen = 0
    for (let i = 0; i < options.length; i++) {
      if (
        space.isFree(labelBounds(plan.fit, options[i]!, plan.direction), avoid)
      ) {
        chosen = i
        break
      }
    }
    const at = options[chosen]!
    space.add(labelBounds(plan.fit, at, plan.direction))
    const inside = chosen < insideCount
    const halo = !inside
      ? theme.floor
      : rug
        ? theme.coveringFill
        : item.asset.mount === "ceiling"
          ? theme.floor
          : theme.furnitureFill
    const { fit } = plan
    const n = fit.lines.length
    const lines = fit.lines.map((line, i) =>
      el(
        "tspan",
        {
          x: 0,
          y: (i - (n - 1) / 2) * LINE_HEIGHT_EM * fit.size + fit.size * 0.35,
        },
        text(line)
      )
    )
    parts.push(
      el(
        "text",
        {
          class: "item-label",
          "data-placement-id": item.placement.id,
          transform: placeAt(at, uprightAngle(plan.direction)),
          "font-size": fit.size,
          "font-weight": 500,
          "text-anchor": "middle",
          fill: rug ? theme.mutedText : theme.text,
          stroke: halo,
          "stroke-width": fit.size * 0.28,
          "stroke-linejoin": "round",
          "paint-order": "stroke",
        },
        lines
      )
    )
  }
  return el("g", { class: "item-labels" }, parts)
}
