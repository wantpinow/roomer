import type { Point } from "../geometry/angles"
import type { Bounds2 } from "../geometry/polygon"
import { localRectToPlan, placementTransform } from "../geometry/transform"
import { add } from "../geometry/vec"
import { findWall, toWallFrame, wallPoint, type Wall } from "../geometry/walls"
import { beamFootprint } from "../lint/context"
import {
  DEFAULT_FACING,
  isBeamFeature,
  isCeilingFeature,
  isFloorFeature,
  isWallFeature,
  type BeamFeature,
  type CeilingFeature,
  type Feature,
  type FloorFeature,
  type WallFeature,
} from "../schema"
import type { PlanContext } from "./context"
import {
  el,
  linePath,
  num,
  placeAt,
  ringsPath,
  text,
  uprightAngle,
} from "./svg"

// Fixed features other than the wall openings: radiators (hatched), piers
// and chimney breasts (solid, like the walls), sockets and switches (small
// symbols on the wall face), hearths and floor obstacles, ceiling fittings
// (circle-and-cross, drawn light because they're overhead) and beams (a
// dashed hidden-overhead outline). Features marked `assumed` are dashed.

export function hatchId(ctx: PlanContext): string {
  return `${ctx.idPrefix}-hatch`
}

export function featureDefs(ctx: PlanContext): string {
  const spacing = Math.max(30, ctx.metrics.font * 0.4)
  return el(
    "pattern",
    {
      id: hatchId(ctx),
      patternUnits: "userSpaceOnUse",
      width: spacing,
      height: spacing,
      patternTransform: "rotate(45)",
    },
    el("path", {
      d: `M0 0V${num(spacing)}`,
      stroke: ctx.theme.fixture,
      "stroke-width": ctx.metrics.hairline,
    })
  )
}

function dash(ctx: PlanContext, feature: Feature): string | undefined {
  const h = ctx.metrics.hairline
  return feature.assumed ? `${num(h * 6)} ${num(h * 4)}` : undefined
}

function group(feature: Feature, kind: string, children: string[]): string {
  return el(
    "g",
    {
      class: `feature ${kind}`,
      "data-id": feature.id,
      "data-feature-id": feature.id,
    },
    children
  )
}

function rectOnWall(
  wall: Wall,
  from: number,
  to: number,
  inset0: number,
  inset1: number
): Point[] {
  return [
    wallPoint(wall, from, inset0),
    wallPoint(wall, to, inset0),
    wallPoint(wall, to, inset1),
    wallPoint(wall, from, inset1),
  ]
}

function drawWallFixture(
  ctx: PlanContext,
  wall: Wall,
  feature: WallFeature
): string | undefined {
  const { theme, metrics } = ctx
  const a = feature.offset
  const b = feature.offset + feature.width
  const mid = (a + b) / 2
  const stroke = {
    stroke: theme.fixture,
    "stroke-width": metrics.hairline * 1.5,
    "stroke-dasharray": dash(ctx, feature),
    "stroke-linejoin": "round",
  } as const
  switch (feature.type) {
    case "radiator": {
      const outline = ringsPath([rectOnWall(wall, a, b, 0, feature.depth)])
      return group(feature, "radiator", [
        el("path", { d: outline, fill: theme.fixtureFill }),
        el("path", { d: outline, fill: `url(#${hatchId(ctx)})`, ...stroke }),
      ])
    }
    case "obstacle":
      // Structural: drawn like the walls, tucked under the wall band.
      return group(feature, `obstacle ${feature.kind}`, [
        el("path", {
          d: ringsPath([
            rectOnWall(wall, a, b, -metrics.wall / 2, feature.depth),
          ]),
          fill: theme.wall,
          ...(feature.assumed
            ? { "fill-opacity": 0.75, ...stroke, stroke: theme.wall }
            : {}),
        }),
      ])
    case "socket":
    case "switch":
    case "data":
    case "aerial":
    case "wall-light":
      return group(feature, feature.type, outletSymbol(ctx, wall, feature, mid))
    default:
      return undefined
  }
}

function outletSymbol(
  ctx: PlanContext,
  wall: Wall,
  feature: WallFeature,
  along: number
): string[] {
  const { theme, metrics } = ctx
  const style = {
    fill: theme.floor,
    stroke: theme.fixture,
    "stroke-width": metrics.hairline * 1.5,
    "stroke-dasharray": dash(ctx, feature),
  } as const
  const r = Math.min(80, Math.max(45, feature.width / 2))
  const at = (dAlong: number, inset: number) =>
    wallPoint(wall, along + dAlong, inset)
  switch (feature.type) {
    case "socket": {
      // Semicircle bulging into the room (the inward normal is always to
      // the right of the wall's direction, so the arc runs anticlockwise
      // on screen), with one tick per gang.
      const start = at(-r, 0)
      const end = at(r, 0)
      const ticks = (feature.gang ?? 1) === 2 ? [-r * 0.35, r * 0.35] : [0]
      return [
        el("path", {
          d: `M${num(start[0])} ${num(start[1])}A${num(r)} ${num(r)} 0 0 0 ${num(end[0])} ${num(end[1])}`,
          ...style,
        }),
        ...ticks.map((t) =>
          el("path", {
            d: linePath([at(t, r * 0.55), at(t, r * 1.45)]),
            stroke: theme.fixture,
            "stroke-width": metrics.hairline * 1.5,
          })
        ),
      ]
    }
    case "switch": {
      const centre = at(0, 70)
      return [
        el("path", {
          d: linePath([at(0, 0), at(0, 35)]),
          stroke: theme.fixture,
          "stroke-width": metrics.hairline * 1.5,
        }),
        el("circle", { cx: centre[0], cy: centre[1], r: 35, ...style }),
      ]
    }
    case "data":
      return [
        el("path", {
          d: ringsPath([[at(-45, 0), at(45, 0), at(0, 70)]]),
          ...style,
        }),
      ]
    case "aerial":
      return [
        el("path", {
          d: ringsPath([[at(-40, 0), at(40, 0), at(40, 70), at(-40, 70)]]),
          ...style,
        }),
        el("path", {
          d: linePath([at(-40, 70), at(40, 0)]),
          stroke: theme.fixture,
          "stroke-width": metrics.hairline,
        }),
      ]
    default: {
      // wall light: a small lamp with rays
      const centre = at(0, 55)
      return [
        el("circle", { cx: centre[0], cy: centre[1], r: 30, ...style }),
        el("path", {
          d: `${linePath([at(-55, 55), at(-38, 55)])}${linePath([at(38, 55), at(55, 55)])}${linePath([at(0, 92), at(0, 110)])}`,
          stroke: theme.fixture,
          "stroke-width": metrics.hairline,
        }),
      ]
    }
  }
}

export function floorFeatureOutline(feature: FloorFeature): Point[] {
  const transform = placementTransform({
    x: feature.x,
    z: feature.z,
    facing: feature.facing ?? DEFAULT_FACING,
    elevation: 0,
  })
  return localRectToPlan(
    transform,
    -feature.width / 2,
    -feature.depth / 2,
    feature.width / 2,
    feature.depth / 2
  )
}

function drawFloorFeature(ctx: PlanContext, feature: FloorFeature): string {
  const { theme, metrics } = ctx
  const outline = ringsPath([floorFeatureOutline(feature)])
  const stroke = {
    stroke: theme.fixture,
    "stroke-width": metrics.hairline * 1.5,
    "stroke-dasharray": dash(ctx, feature),
  }
  switch (feature.type) {
    case "hearth":
      return group(feature, "hearth", [
        el("path", { d: outline, fill: theme.fixtureFill, ...stroke }),
      ])
    case "floor-obstacle":
      return group(feature, "floor-obstacle", [
        el("path", { d: outline, fill: theme.fixtureFill }),
        el("path", { d: outline, fill: `url(#${hatchId(ctx)})`, ...stroke }),
      ])
    case "floor-socket": {
      const r = Math.min(feature.width, feature.depth) / 3
      return group(feature, "floor-socket", [
        el("path", { d: outline, fill: theme.floor, ...stroke }),
        el("circle", {
          cx: feature.x,
          cy: feature.z,
          r,
          fill: "none",
          ...stroke,
        }),
      ])
    }
  }
}

function drawCeilingFeature(ctx: PlanContext, feature: CeilingFeature): string {
  const { theme, metrics } = ctx
  const style = {
    fill: "none",
    stroke: theme.fixture,
    "stroke-width": metrics.hairline * 1.5,
    "stroke-dasharray": dash(ctx, feature),
  }
  const c: Point = [feature.x, feature.z]
  const cross = (r: number, diagonal: boolean) => {
    const k = diagonal ? r * Math.SQRT1_2 : r
    const [dx1, dz1, dx2, dz2] = diagonal ? [k, k, k, -k] : [r, 0, 0, r]
    return el("path", {
      d: `${linePath([add(c, [-dx1, -dz1]), add(c, [dx1, dz1])])}${linePath([add(c, [-dx2, -dz2]), add(c, [dx2, dz2])])}`,
      stroke: theme.fixture,
      "stroke-width": metrics.hairline,
    })
  }
  switch (feature.type) {
    case "pendant":
      return group(feature, "pendant", [
        el("circle", { cx: c[0], cy: c[1], r: 110, ...style }),
        cross(110, true),
      ])
    case "ceiling-light":
      return group(feature, "ceiling-light", [
        el("circle", { cx: c[0], cy: c[1], r: 110, ...style }),
        cross(150, false),
      ])
    case "spotlight":
      return group(feature, "spotlight", [
        el("circle", { cx: c[0], cy: c[1], r: 45, ...style }),
        el("circle", { cx: c[0], cy: c[1], r: 12, fill: theme.fixture }),
      ])
    case "smoke-alarm":
      return group(feature, "smoke-alarm", [
        el("circle", { cx: c[0], cy: c[1], r: 70, ...style }),
        el("circle", { cx: c[0], cy: c[1], r: 32, ...style }),
      ])
  }
}

function drawBeam(ctx: PlanContext, beam: BeamFeature): string | undefined {
  const footprint = beamFootprint(beam)
  if (!footprint) return undefined
  const h = ctx.metrics.hairline
  return group(beam, "beam", [
    el("path", {
      d: ringsPath([footprint]),
      fill: "none",
      stroke: ctx.theme.fixture,
      "stroke-width": h * 1.5,
      // Hidden-overhead line: long dashes, short gaps.
      "stroke-dasharray": `${num(h * 12)} ${num(h * 5)}`,
    }),
  ])
}

/** Floor features: drawn under the furniture. */
export function drawFloorFeatures(ctx: PlanContext): string {
  return el(
    "g",
    { class: "floor-features" },
    ctx.room.features
      .filter(isFloorFeature)
      .map((f) => drawFloorFeature(ctx, f))
  )
}

/** Radiators, sockets and other wall fixtures: drawn under the furniture. */
export function drawWallFixtures(ctx: PlanContext): string {
  const parts: string[] = []
  for (const feature of ctx.room.features) {
    if (!isWallFeature(feature) || feature.type === "obstacle") continue
    const wall = findWall(ctx.walls, feature.wall)
    if (!wall) continue
    const drawn = drawWallFixture(ctx, wall, feature)
    if (drawn) parts.push(drawn)
  }
  return el("g", { class: "wall-fixtures" }, parts)
}

/** Piers and chimney breasts: drawn with (just under) the wall band. */
export function drawWallObstacles(ctx: PlanContext): string {
  const parts: string[] = []
  for (const feature of ctx.room.features) {
    if (!isWallFeature(feature) || feature.type !== "obstacle") continue
    const wall = findWall(ctx.walls, feature.wall)
    if (!wall) continue
    const drawn = drawWallFixture(ctx, wall, feature)
    if (drawn) parts.push(drawn)
  }
  return el("g", { class: "wall-obstacles" }, parts)
}

/** Ceiling fittings and beams: drawn over the furniture. */
export function drawOverhead(ctx: PlanContext): string {
  const parts: string[] = []
  for (const feature of ctx.room.features) {
    if (isCeilingFeature(feature)) parts.push(drawCeilingFeature(ctx, feature))
    else if (isBeamFeature(feature)) {
      const drawn = drawBeam(ctx, feature)
      if (drawn) parts.push(drawn)
    }
  }
  return el("g", { class: "overhead" }, parts)
}

/**
 * Boxes that item labels should keep clear of: ceiling fittings drawn over
 * the furniture, and their ids.
 */
export function overheadLabelObstacles(ctx: PlanContext): Bounds2[] {
  const { small } = ctx.metrics
  const boxes: Bounds2[] = []
  for (const feature of ctx.room.features) {
    if (!isCeilingFeature(feature)) continue
    const r = 130
    boxes.push(
      {
        minX: feature.x - r,
        maxX: feature.x + r,
        minZ: feature.z - r,
        maxZ: feature.z + r,
      },
      {
        minX: feature.x + 150,
        maxX: feature.x + 150 + feature.id.length * small * 0.62,
        minZ: feature.z - 150 - small * 0.6,
        maxZ: feature.z - 150 + small * 0.6,
      }
    )
  }
  return boxes
}

/** The wall a plan point lies on (within 5mm), if any. */
function wallUnder(ctx: PlanContext, point: Point): Wall | undefined {
  return ctx.walls.find((wall) => {
    const { along, inset } = toWallFrame(wall, point)
    return Math.abs(inset) <= 5 && along >= -5 && along <= wall.length + 5
  })
}

/** An outline around a feature, for highlighting it. */
export function featureOutline(
  ctx: PlanContext,
  feature: Feature
): Point[] | undefined {
  if (isWallFeature(feature)) {
    const wall = findWall(ctx.walls, feature.wall)
    if (!wall) return undefined
    const depth = "depth" in feature ? feature.depth : 0
    return rectOnWall(
      wall,
      feature.offset,
      feature.offset + feature.width,
      -ctx.metrics.wall,
      Math.max(depth, 120)
    )
  }
  if (isFloorFeature(feature)) return floorFeatureOutline(feature)
  if (isBeamFeature(feature)) return beamFootprint(feature)
  const r = 150
  return [
    [feature.x - r, feature.z - r],
    [feature.x + r, feature.z - r],
    [feature.x + r, feature.z + r],
    [feature.x - r, feature.z + r],
  ]
}

interface LaneLabel {
  wall: Wall
  id: string
  along: number
  half: number
}

/**
 * Feature ids outside the wall band, stacked into lanes so ids at the same
 * place along a wall (a window and its radiator) don't overprint. Returns
 * the SVG and how many lanes the busiest wall needed.
 */
export function drawFeatureIds(ctx: PlanContext): {
  svg: string
  lanes: number
} {
  const { metrics, theme } = ctx
  const charWidth = metrics.small * 0.62
  const byWall = new Map<string, LaneLabel[]>()
  const push = (wall: Wall, id: string, along: number) => {
    const list = byWall.get(wall.id) ?? []
    list.push({
      wall,
      id,
      along,
      half: (id.length * charWidth) / 2 + metrics.small * 0.4,
    })
    byWall.set(wall.id, list)
  }
  const beamsInside: BeamFeature[] = []
  for (const feature of ctx.room.features) {
    if (isWallFeature(feature)) {
      const wall = findWall(ctx.walls, feature.wall)
      if (wall) push(wall, feature.id, feature.offset + feature.width / 2)
    } else if (isBeamFeature(feature)) {
      // Beams usually run wall to wall: label the end on a wall, outside.
      const end = [feature.end, feature.start]
        .map((point) => ({ point, wall: wallUnder(ctx, point) }))
        .find((e) => e.wall !== undefined)
      if (end?.wall)
        push(end.wall, feature.id, toWallFrame(end.wall, end.point).along)
      else beamsInside.push(feature)
    }
  }
  const parts: string[] = []
  let lanes = 0
  for (const wall of ctx.walls) {
    const labels = (byWall.get(wall.id) ?? []).sort(
      (a, b) => a.along - b.along || (a.id < b.id ? -1 : 1)
    )
    const laneEnds: number[] = []
    for (const label of labels) {
      let lane = laneEnds.findIndex((end) => end <= label.along - label.half)
      if (lane < 0) {
        lane = laneEnds.length
        laneEnds.push(0)
      }
      laneEnds[lane] = label.along + label.half
      const inset = -(metrics.wall + metrics.gap + (lane + 0.5) * metrics.lane)
      parts.push(
        el(
          "text",
          {
            class: "feature-id",
            "data-feature-id": label.id,
            transform: placeAt(
              wallPoint(wall, label.along, inset),
              uprightAngle(wall.dir)
            ),
            y: metrics.small * 0.35,
            "font-size": metrics.small,
            "text-anchor": "middle",
            fill: theme.mutedText,
            "letter-spacing": metrics.small * 0.04,
          },
          text(label.id)
        )
      )
    }
    lanes = Math.max(lanes, laneEnds.length)
  }

  // Floor and ceiling features: their id beside the symbol.
  for (const feature of ctx.room.features) {
    let at: Point | undefined
    if (isCeilingFeature(feature)) {
      at = add([feature.x, feature.z], [150, -150])
    } else if (isFloorFeature(feature)) {
      at = [feature.x, feature.z]
    }
    if (!at) continue
    parts.push(
      el(
        "text",
        {
          class: "feature-id",
          "data-feature-id": feature.id,
          x: at[0],
          y: at[1] + metrics.small * 0.35,
          "font-size": metrics.small,
          "text-anchor": isCeilingFeature(feature) ? "start" : "middle",
          fill: theme.mutedText,
          stroke: theme.floor,
          "stroke-width": metrics.small * 0.3,
          "paint-order": "stroke",
        },
        text(feature.id)
      )
    )
  }
  for (const beam of beamsInside) {
    const at: Point = [
      (beam.start[0] + beam.end[0]) / 2,
      (beam.start[1] + beam.end[1]) / 2,
    ]
    const dir: Point = [
      beam.end[0] - beam.start[0],
      beam.end[1] - beam.start[1],
    ]
    parts.push(
      el(
        "text",
        {
          class: "feature-id",
          "data-feature-id": beam.id,
          transform: placeAt(at, uprightAngle(dir)),
          y: metrics.small * 0.35,
          "font-size": metrics.small,
          "text-anchor": "middle",
          fill: theme.mutedText,
          stroke: theme.floor,
          "stroke-width": metrics.small * 0.3,
          "paint-order": "stroke",
        },
        text(beam.id)
      )
    )
  }
  return { svg: el("g", { class: "feature-ids" }, parts), lanes }
}
