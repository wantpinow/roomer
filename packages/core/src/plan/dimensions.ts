import type { Point } from "../geometry/angles"
import { containsPoint, type Bounds2 } from "../geometry/polygon"
import { formatDegrees, formatNumber } from "../geometry/format"
import { add, dot, normalize, scale, sub } from "../geometry/vec"
import { cornerAngles, type Wall } from "../geometry/walls"
import type { PlanContext } from "./context"
import { el, linePath, num, placeAt, text, uprightAngle } from "./svg"

// Architect-style dimensions outside the walls: each wall's plaster-to-
// plaster length on a dimension line with extension lines and slash ticks.
// A wall whose line would run through the building (either side of a
// notch) is pushed out to line up with the outermost wall facing the same
// way, forming a chain; chained sides also get an overall dimension. Corner
// ids sit outside each corner, and corners that aren't square get their
// angle.

export interface DimensionResult {
  svg: string
  /** Everything drawn, for sizing the viewBox. */
  box: Bounds2
}

interface Placed {
  wall: Wall
  /** Outward unit normal. */
  out: Point
  /** Offset of the dimension line from the wall, mm. */
  offset: number
  /** Where extension lines start, from the wall, mm. */
  extStart: number
}

function grow(box: Bounds2, p: Point, pad = 0): void {
  box.minX = Math.min(box.minX, p[0] - pad)
  box.maxX = Math.max(box.maxX, p[0] + pad)
  box.minZ = Math.min(box.minZ, p[1] - pad)
  box.maxZ = Math.max(box.maxZ, p[1] + pad)
}

/** How far the room reaches beyond a wall's line, outwards. */
function outwardExtent(ctx: PlanContext, wall: Wall): number {
  let extent = 0
  for (const corner of ctx.polygon) {
    extent = Math.max(extent, -dot(sub(corner, wall.start), wall.normal))
  }
  return extent
}

function crossesBuilding(ctx: PlanContext, a: Point, b: Point): boolean {
  const steps = Math.max(
    2,
    Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 40)
  )
  for (let i = 1; i < steps; i++) {
    const p: Point = [
      a[0] + ((b[0] - a[0]) * i) / steps,
      a[1] + ((b[1] - a[1]) * i) / steps,
    ]
    if (containsPoint(ctx.outer, p)) return true
  }
  return false
}

export function drawDimensions(
  ctx: PlanContext,
  labelLanes: number
): DimensionResult {
  const { metrics, theme } = ctx
  const box: Bounds2 = { ...ctx.bounds }
  const base =
    metrics.wall + metrics.gap + labelLanes * metrics.lane + metrics.dim * 1.1
  const extGap = metrics.dim * 0.35
  const parts: string[] = []

  const placed: Placed[] = ctx.walls.map((wall) => {
    const out = scale(wall.normal, -1)
    const line = (offset: number): [Point, Point] => [
      add(wall.start, scale(out, offset)),
      add(wall.end, scale(out, offset)),
    ]
    let offset = base
    let extStart = metrics.wall + extGap
    if (crossesBuilding(ctx, ...line(offset))) {
      const extent = outwardExtent(ctx, wall)
      offset = extent + base
      extStart = extent + metrics.wall + extGap
      for (let i = 0; i < 3 && crossesBuilding(ctx, ...line(offset)); i++) {
        offset += metrics.dim * 2
      }
    }
    return { wall, out, offset, extStart }
  })

  const tick = metrics.dim * 0.28
  const strokeAttrs = {
    stroke: theme.dimension,
    "stroke-width": metrics.hairline,
    fill: "none",
  }

  const dimension = (
    from: Point,
    dir: Point,
    out: Point,
    length: number,
    offset: number,
    extStart: number,
    label: string,
    attrs: Record<string, string>
  ): string => {
    const a = add(from, scale(out, offset))
    const b = add(a, scale(dir, length))
    const ends: Point[] = [from, add(from, scale(dir, length))]
    const slash = normalize(add(dir, out))
    const path = [
      linePath([a, b]),
      ...ends.map((p) =>
        linePath([
          add(p, scale(out, extStart)),
          add(p, scale(out, offset + metrics.dim * 0.35)),
        ])
      ),
      ...[a, b].map((p) =>
        linePath([add(p, scale(slash, -tick)), add(p, scale(slash, tick))])
      ),
    ].join("")
    const textAt = add(scale(add(a, b), 0.5), scale(out, metrics.dim * 0.62))
    grow(box, a)
    grow(box, b)
    grow(box, textAt, metrics.dim * 1.2)
    return el("g", { class: "dimension", ...attrs }, [
      el("path", { d: path, ...strokeAttrs }),
      el(
        "text",
        {
          transform: placeAt(textAt, uprightAngle(dir)),
          y: metrics.dim * 0.35,
          "font-size": metrics.dim,
          "text-anchor": "middle",
          fill: theme.dimension,
          "font-variant-numeric": "tabular-nums",
        },
        label
      ),
    ])
  }

  for (const p of placed) {
    const label = `${el(
      "tspan",
      { fill: theme.mutedText, "font-size": metrics.small },
      text(`${p.wall.id}  `)
    )}${text(formatNumber(p.wall.length))}`
    parts.push(
      dimension(
        p.wall.start,
        p.wall.dir,
        p.out,
        p.wall.length,
        p.offset,
        p.extStart,
        label,
        { "data-wall-id": p.wall.id }
      )
    )
  }

  // Overall dimensions for sides measured in more than one piece.
  const sides = new Map<string, Placed[]>()
  for (const p of placed) {
    const key = `${Math.round(p.wall.inwardBearing)}:${Math.round(
      dot(add(p.wall.start, scale(p.out, p.offset)), p.out)
    )}`
    sides.set(key, [...(sides.get(key) ?? []), p])
  }
  for (const group of sides.values()) {
    if (group.length < 2) continue
    const first = group[0]!
    const dir = first.wall.dir
    const along = ctx.polygon.map((c) => dot(c, dir))
    const min = Math.min(...along)
    const max = Math.max(...along)
    const reference = first.wall.start
    const from = add(reference, scale(dir, min - dot(reference, dir)))
    parts.push(
      dimension(
        from,
        dir,
        first.out,
        max - min,
        first.offset + metrics.dim * 2.3,
        first.offset + metrics.dim * 0.8,
        text(formatNumber(max - min)),
        { "data-overall": "true" }
      )
    )
  }

  // Corner ids outside each corner, and angles that aren't square.
  const angles = cornerAngles(ctx.room.corners)
  const n = ctx.polygon.length
  ctx.polygon.forEach((corner, i) => {
    const incoming = ctx.walls[(i + n - 1) % n]!
    const outgoing = ctx.walls[i]!
    const bisectorIn = normalize(add(incoming.normal, outgoing.normal))
    const outer = ctx.outer[i]!
    const at = add(outer, scale(bisectorIn, -metrics.small * 1.3))
    grow(box, at, metrics.small)
    parts.push(
      el(
        "text",
        {
          class: "corner-id",
          x: at[0],
          y: at[1] + metrics.small * 0.35,
          "font-size": metrics.small,
          "text-anchor": "middle",
          fill: theme.mutedText,
        },
        text(`C${i + 1}`)
      )
    )
    const angle = angles[i]!
    const square = Math.abs(angle - 90) < 0.5 || Math.abs(angle - 270) < 0.5
    if (square) return
    const r = metrics.font * 2.2
    const a = add(corner, scale(scale(incoming.dir, -1), r))
    const b = add(corner, scale(outgoing.dir, r))
    const labelAt = add(corner, scale(bisectorIn, r * 1.55))
    parts.push(
      el("g", { class: "corner-angle", "data-corner": `C${i + 1}` }, [
        el("path", {
          d: `M${num(a[0])} ${num(a[1])}A${num(r)} ${num(r)} 0 ${angle > 180 ? 1 : 0} 0 ${num(b[0])} ${num(b[1])}`,
          ...strokeAttrs,
        }),
        el(
          "text",
          {
            x: labelAt[0],
            y: labelAt[1] + metrics.small * 0.35,
            "font-size": metrics.small,
            "text-anchor": "middle",
            fill: theme.dimension,
          },
          text(formatDegrees(angle))
        ),
      ])
    )
  })

  return { svg: el("g", { class: "dimensions" }, parts), box }
}
