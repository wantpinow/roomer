import type { Point } from "../geometry/angles"
import { add, cross, scale } from "../geometry/vec"
import { wallPoint, type Wall } from "../geometry/walls"
import { union } from "../lint/polygons"
import {
  isWallFeature,
  type DoorFeature,
  type OpeningFeature,
  type WallFeature,
  type WindowFeature,
} from "../schema"
import type { PlanContext } from "./context"
import { el, linePath, num, ringsPath } from "./svg"

// The wall band: a solid charcoal strip outside the plaster line, mitred at
// the corners and broken where doors, openings and windows are. Windows get
// their frame and glazing lines in the gap; doors a leaf and a dashed swing
// arc (inside the room for doors that swing in, outside for doors that
// swing out); openings a pair of dashed lintel lines.

type Gap = DoorFeature | OpeningFeature | WindowFeature

function isGap(feature: WallFeature): feature is Gap {
  return (
    feature.type === "door" ||
    feature.type === "opening" ||
    feature.type === "window"
  )
}

function gapsOn(ctx: PlanContext, wall: Wall): Gap[] {
  return ctx.room.features
    .filter(isWallFeature)
    .filter((f): f is Gap => f.wall === wall.id && isGap(f))
    .sort((a, b) => a.offset - b.offset)
}

/** Solid spans of a wall between its openings, as [from, to] along it. */
function solidSpans(wall: Wall, gaps: readonly Gap[]): [number, number][] {
  const spans: [number, number][] = []
  let from = 0
  for (const gap of gaps) {
    const start = Math.max(0, Math.min(wall.length, gap.offset))
    if (start > from) spans.push([from, start])
    from = Math.max(from, gap.offset + gap.width)
  }
  if (from < wall.length) spans.push([from, wall.length])
  return spans.filter(([a, b]) => b - a > 0.5)
}

/** The wall band as polygons with holes (one path, even-odd). */
export function wallBand(ctx: PlanContext): Point[][][] {
  const t = ctx.metrics.wall
  const n = ctx.walls.length
  const pieces: Point[][] = []
  ctx.walls.forEach((wall, i) => {
    const startOuter = ctx.outer[i]!
    const endOuter = ctx.outer[(i + 1) % n]!
    for (const [from, to] of solidSpans(wall, gapsOn(ctx, wall))) {
      pieces.push([
        wallPoint(wall, from),
        wallPoint(wall, to),
        to >= wall.length - 0.5 ? endOuter : wallPoint(wall, to, -t),
        from <= 0.5 ? startOuter : wallPoint(wall, from, -t),
      ])
    }
  })
  return pieces.length > 0 ? union(pieces) : []
}

export function drawWalls(ctx: PlanContext): string {
  const band = wallBand(ctx)
  return el("path", {
    class: "walls",
    d: band.map((polygon) => ringsPath(polygon)).join(""),
    fill: ctx.theme.wall,
    "fill-rule": "evenodd",
  })
}

function dashFor(ctx: PlanContext, feature: { assumed?: boolean | undefined }) {
  return feature.assumed
    ? `${num(ctx.metrics.hairline * 6)} ${num(ctx.metrics.hairline * 4)}`
    : undefined
}

function drawWindow(
  ctx: PlanContext,
  wall: Wall,
  feature: WindowFeature
): string {
  const t = ctx.metrics.wall
  const { theme } = ctx
  const a = feature.offset
  const b = feature.offset + feature.width
  const line = (inset: number, color: string, width: number) =>
    el("path", {
      d: linePath([wallPoint(wall, a, inset), wallPoint(wall, b, inset)]),
      stroke: color,
      "stroke-width": width,
      "stroke-dasharray": dashFor(ctx, feature),
      fill: "none",
    })
  const jamb = (along: number) =>
    el("path", {
      d: linePath([wallPoint(wall, along, 0), wallPoint(wall, along, -t)]),
      stroke: theme.wall,
      "stroke-width": ctx.metrics.hairline * 1.5,
    })
  const sillDepth = feature.sillDepth ?? 0
  const sill =
    sillDepth > 0
      ? el("path", {
          d: ringsPath([
            [
              wallPoint(wall, a - 20, 0),
              wallPoint(wall, b + 20, 0),
              wallPoint(wall, b + 20, sillDepth),
              wallPoint(wall, a - 20, sillDepth),
            ],
          ]),
          fill: theme.floor,
          stroke: theme.fixture,
          "stroke-width": ctx.metrics.hairline,
        })
      : ""
  return el(
    "g",
    {
      class: "window",
      "data-id": feature.id,
      "data-feature-id": feature.id,
    },
    [
      el("path", {
        d: ringsPath([
          [
            wallPoint(wall, a, 0),
            wallPoint(wall, b, 0),
            wallPoint(wall, b, -t),
            wallPoint(wall, a, -t),
          ],
        ]),
        fill: theme.paper,
      }),
      sill,
      line(0, theme.wall, ctx.metrics.hairline * 1.5),
      line(-t, theme.wall, ctx.metrics.hairline * 1.5),
      line(-t / 2, theme.glass, ctx.metrics.hairline * 2),
      jamb(a),
      jamb(b),
    ]
  )
}

/** Hinge, closed and open directions of each leaf of a door. */
export function doorLeaves(
  wall: Wall,
  door: DoorFeature
): { hinge: Point; closed: Point; open: Point; radius: number }[] {
  if (door.swing === "none") return []
  const leaves = door.leaves ?? 1
  const radius = door.width / leaves
  const side = door.swing === "in" ? 1 : -1
  const open = scale(wall.normal, side)
  const start = {
    hinge: wallPoint(wall, door.offset),
    closed: wall.dir,
  }
  const end = {
    hinge: wallPoint(wall, door.offset + door.width),
    closed: scale(wall.dir, -1),
  }
  const jambs =
    leaves === 2 ? [start, end] : [door.hinge === "start" ? start : end]
  return jambs.map((jamb) => ({ ...jamb, open, radius }))
}

function drawDoor(ctx: PlanContext, wall: Wall, door: DoorFeature): string {
  const { theme, metrics } = ctx
  const leafThickness = Math.max(25, metrics.wall * 0.35)
  const parts: string[] = []
  for (const leaf of doorLeaves(wall, door)) {
    const tip = add(leaf.hinge, scale(leaf.open, leaf.radius))
    const shut = add(leaf.hinge, scale(leaf.closed, leaf.radius))
    const back = scale(leaf.closed, leafThickness)
    parts.push(
      el("path", {
        class: "door-leaf",
        d: ringsPath([
          [leaf.hinge, tip, add(tip, back), add(leaf.hinge, back)],
        ]),
        fill: theme.floor,
        stroke: theme.wall,
        "stroke-width": metrics.hairline * 1.5,
        "stroke-linejoin": "round",
        "stroke-dasharray": dashFor(ctx, door),
      }),
      el("path", {
        class: "door-swing",
        d: `M${num(tip[0])} ${num(tip[1])}A${num(leaf.radius)} ${num(leaf.radius)} 0 0 ${cross(leaf.open, leaf.closed) > 0 ? 1 : 0} ${num(shut[0])} ${num(shut[1])}`,
        fill: "none",
        stroke: theme.swing,
        "stroke-width": metrics.hairline,
        "stroke-dasharray": `${num(metrics.hairline * 5)} ${num(metrics.hairline * 4)}`,
      })
    )
  }
  if (door.swing === "none") {
    parts.push(
      el("path", {
        d: linePath([
          wallPoint(wall, door.offset, -metrics.wall / 2),
          wallPoint(wall, door.offset + door.width, -metrics.wall / 2),
        ]),
        stroke: theme.wall,
        "stroke-width": metrics.hairline * 2,
      })
    )
  }
  return el(
    "g",
    { class: "door", "data-id": door.id, "data-feature-id": door.id },
    parts
  )
}

function drawOpening(
  ctx: PlanContext,
  wall: Wall,
  opening: OpeningFeature
): string {
  const { metrics, theme } = ctx
  const dash = `${num(metrics.hairline * 5)} ${num(metrics.hairline * 4)}`
  const line = (inset: number) =>
    el("path", {
      d: linePath([
        wallPoint(wall, opening.offset, inset),
        wallPoint(wall, opening.offset + opening.width, inset),
      ]),
      stroke: theme.wall,
      "stroke-width": metrics.hairline,
      "stroke-dasharray": dash,
    })
  return el(
    "g",
    { class: "opening", "data-id": opening.id, "data-feature-id": opening.id },
    [line(0), line(-metrics.wall)]
  )
}

export function drawOpenings(ctx: PlanContext): string {
  const parts: string[] = []
  for (const wall of ctx.walls) {
    for (const gap of gapsOn(ctx, wall)) {
      if (gap.type === "window") parts.push(drawWindow(ctx, wall, gap))
      else if (gap.type === "door") parts.push(drawDoor(ctx, wall, gap))
      else parts.push(drawOpening(ctx, wall, gap))
    }
  }
  return el("g", { class: "openings" }, parts)
}
