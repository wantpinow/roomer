import type { Point } from "../geometry/angles"
import { pointSegmentDistance } from "../geometry/distance"
import { clipToBounds } from "../geometry/hull"
import type { Bounds2 } from "../geometry/polygon"
import { dot, sub } from "../geometry/vec"
import { wallPoint, type Wall } from "../geometry/walls"
import type { DoorZone, LintContext, LintItem, Obstacle } from "./context"
import {
  cellCentre,
  createGrid,
  fillPolygon,
  neighbours,
  squaredDistances,
  type Grid,
} from "./grid"
import { closestBetween } from "./polygons"

// Walking routes (W101/I202) and clearance-zone reachability (W102) on a
// 25mm occupancy grid. Cells are blocked by the outside of the room, fixed
// obstacles and item parts at walking height (rugs don't count). A distance
// transform gives every free cell its clearance; processing cells from the
// most to the least clearance with a union-find yields the widest route
// between every pair of doors (its bottleneck is where they first join) and,
// as a snapshot, the space reachable along routes wide enough for a person.
// Doorway zones are the seeds, so a door's own width never counts as a pinch.

export type WalkwayBlocker =
  | { kind: "wall"; name: string; wall: Wall }
  | { kind: "obstacle"; name: string; obstacle: Obstacle }
  | { kind: "item"; name: string; item: LintItem }

export interface RouteResult {
  from: DoorZone
  to: DoorZone
  /** Narrowest width along the widest route, mm (0 when there's none). */
  width: number
  /** False when every route is blocked outright. */
  connected: boolean
  /** Where the route is narrowest. */
  pinch: Point
  /** What hems the pinch in (one or two blockers). */
  blockers: WalkwayBlocker[]
  /** Unit direction from the first blocker towards the second. */
  across?: Point
}

export interface WalkwayAnalysis {
  grid: Grid
  routes: RouteResult[]
  /**
   * Whether a person can get to the zone along a route at least
   * `clearanceReachMinMm` wide from any door; undefined when the room has no
   * usable doors.
   */
  reachable(zone: readonly Point[]): boolean | undefined
}

interface Seeded {
  door: DoorZone
  cells: number[]
  rep: number
}

function nearestWallIndex(walls: readonly Wall[], point: Point): number {
  let best = 0
  let bestDistance = Infinity
  walls.forEach((wall, index) => {
    const distance = pointSegmentDistance(point, wall.start, wall.end)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

function buildBlockers(ctx: LintContext, grid: Grid): WalkwayBlocker[] {
  const height = ctx.thresholds.walkingHeightMm
  const blockers: WalkwayBlocker[] = ctx.walls.map((wall) => ({
    kind: "wall",
    name: wall.id,
    wall,
  }))
  for (let i = 0; i < grid.label.length; i++) {
    if (!grid.inside[i]) {
      grid.label[i] = nearestWallIndex(ctx.walls, cellCentre(grid, i)) + 1
    }
  }
  const mark = (polygon: readonly Point[], label: number) =>
    fillPolygon(grid, polygon, (index) => {
      if (!grid.inside[index]) return
      grid.blocked[index] = 1
      grid.label[index] = label
    })
  for (const obstacle of ctx.obstacles) {
    if (obstacle.kind === "skirting") continue
    if (obstacle.solid.y0 >= height || obstacle.solid.y1 <= 0) continue
    blockers.push({ kind: "obstacle", name: obstacle.name, obstacle })
    mark(obstacle.solid.footprint, blockers.length)
  }
  for (const item of ctx.items) {
    if (item.covering) continue
    const parts = item.parts.filter((p) => p.y0 < height && p.y1 > 0)
    if (parts.length === 0) continue
    blockers.push({ kind: "item", name: item.name, item })
    for (const part of parts) mark(part.footprint, blockers.length)
  }
  return blockers
}

function seedDoors(ctx: LintContext, grid: Grid): Seeded[] {
  const seeded: Seeded[] = []
  for (const door of ctx.doors) {
    const cells: number[] = []
    fillPolygon(grid, door.doorway.footprint, (index) => {
      if (grid.inside[index] && !grid.blocked[index]) cells.push(index)
    })
    if (cells.length === 0) continue
    const entry = wallPoint(
      door.wall,
      door.feature.offset + door.feature.width / 2,
      grid.cell
    )
    let rep = cells[0]!
    let repDistance = Infinity
    for (const index of cells) {
      const [x, z] = cellCentre(grid, index)
      const distance = Math.hypot(x - entry[0], z - entry[1])
      if (distance < repDistance) {
        repDistance = distance
        rep = index
      }
    }
    seeded.push({ door, cells, rep })
  }
  return seeded
}

/** Cells sorted by an integer key, largest first (counting sort). */
function sortByKeyDescending(cells: number[], key: Float64Array): number[] {
  let max = 0
  for (const c of cells) max = Math.max(max, key[c]!)
  const counts = new Int32Array(max + 2)
  for (const c of cells) counts[max - key[c]!]!++
  let total = 0
  for (let k = 0; k < counts.length; k++) {
    const count = counts[k]!
    counts[k] = total
    total += count
  }
  const sorted = new Array<number>(cells.length)
  for (const c of cells) sorted[counts[max - key[c]!]!++] = c
  return sorted
}

function geometryOf(blocker: WalkwayBlocker, box: Bounds2, height: number) {
  switch (blocker.kind) {
    case "wall":
      return { polygons: [], segments: [clipSegment(blocker.wall, box)] }
    case "obstacle":
      return {
        polygons: [clipToBounds(blocker.obstacle.solid.footprint, box)],
        segments: [],
      }
    case "item":
      return {
        polygons: blocker.item.parts
          .filter((p) => p.y0 < height && p.y1 > 0)
          .map((p) => clipToBounds(p.footprint, box)),
        segments: [],
      }
  }
}

function clipSegment(wall: Wall, box: Bounds2): Point[] {
  // Liang–Barsky against the box; an empty result keeps the full segment
  // out of the window by returning nothing.
  const d = sub(wall.end, wall.start)
  let t0 = 0
  let t1 = 1
  const tests: [number, number][] = [
    [-d[0], wall.start[0] - box.minX],
    [d[0], box.maxX - wall.start[0]],
    [-d[1], wall.start[1] - box.minZ],
    [d[1], box.maxZ - wall.start[1]],
  ]
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return []
      continue
    }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return []
  }
  return [
    [wall.start[0] + d[0] * t0, wall.start[1] + d[1] * t0],
    [wall.start[0] + d[0] * t1, wall.start[1] + d[1] * t1],
  ]
}

/** Exact gap between two blockers near a point, with the closest points. */
function exactGap(
  a: WalkwayBlocker,
  b: WalkwayBlocker,
  centre: Point,
  radius: number,
  height: number
): { distance: number; p: Point; q: Point } | undefined {
  const box: Bounds2 = {
    minX: centre[0] - radius,
    maxX: centre[0] + radius,
    minZ: centre[1] - radius,
    maxZ: centre[1] + radius,
  }
  const ga = geometryOf(a, box, height)
  const gb = geometryOf(b, box, height)
  const shapesA = [
    ...ga.polygons.map((p) => ({ points: p, closed: true })),
    ...ga.segments.map((s) => ({ points: s, closed: false })),
  ].filter((s) => s.points.length >= 2)
  const shapesB = [
    ...gb.polygons.map((p) => ({ points: p, closed: true })),
    ...gb.segments.map((s) => ({ points: s, closed: false })),
  ].filter((s) => s.points.length >= 2)
  let best: { distance: number; p: Point; q: Point } | undefined
  for (const sa of shapesA) {
    for (const sb of shapesB) {
      const found = closestBetween(sa.points, sb.points, sa.closed, sb.closed)
      if (found && (!best || found.distance < best.distance)) best = found
    }
  }
  return best
}

interface PinchBlockers {
  first?: { label: number; cell: number }
  second?: { label: number; cell: number }
}

/**
 * The nearest blocker to a cell and the nearest one across from it;
 * `secondOk` filters what may count as the second.
 */
function blockersAround(
  grid: Grid,
  pinch: number,
  radius: number,
  secondOk: (label: number) => boolean = () => true
): PinchBlockers {
  const col = pinch % grid.cols
  const row = (pinch - col) / grid.cols
  const nearest = new Map<number, { cell: number; d2: number }>()
  for (let dr = -radius; dr <= radius; dr++) {
    const r = row + dr
    if (r < 0 || r >= grid.rows) continue
    for (let dc = -radius; dc <= radius; dc++) {
      const c = col + dc
      if (c < 0 || c >= grid.cols) continue
      const index = r * grid.cols + c
      if (!grid.blocked[index]) continue
      const label = grid.label[index]!
      if (label === 0) continue
      const d2 = dr * dr + dc * dc
      const known = nearest.get(label)
      if (!known || d2 < known.d2) nearest.set(label, { cell: index, d2 })
    }
  }
  const ranked = [...nearest.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => a.d2 - b.d2 || a.label - b.label)
  const first = ranked[0]
  if (!first) return {}
  const here = cellCentre(grid, pinch)
  const towardsFirst = sub(cellCentre(grid, first.cell), here)
  const others = ranked.filter(
    (r) => r.label !== first.label && secondOk(r.label)
  )
  const across = others.find(
    (r) => dot(sub(cellCentre(grid, r.cell), here), towardsFirst) <= 0
  )
  const second = across ?? others[0]
  return {
    first: { label: first.label, cell: first.cell },
    ...(second ? { second: { label: second.label, cell: second.cell } } : {}),
  }
}

export function analyseWalkways(ctx: LintContext): WalkwayAnalysis {
  const {
    gridCellMm: cell,
    walkingHeightMm,
    clearanceReachMinMm,
  } = ctx.thresholds
  const grid = createGrid(ctx.polygon, cell)
  const blockers = buildBlockers(ctx, grid)
  const size = grid.cols * grid.rows
  const clearance2 = squaredDistances(grid, grid.blocked)
  const seeded = seedDoors(ctx, grid)
  const step = neighbours(grid)

  const parent = new Int32Array(size).fill(-1)
  const rank = new Uint8Array(size)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  const add = (cell: number): boolean => {
    parent[cell] = cell
    let merged = false
    for (const offset of step) {
      const other = cell + offset
      if (parent[other]! < 0) continue
      const a = find(cell)
      const b = find(other)
      if (a === b) continue
      merged = true
      if (rank[a]! < rank[b]!) parent[a] = b
      else if (rank[a]! > rank[b]!) parent[b] = a
      else {
        parent[b] = a
        rank[a]!++
      }
    }
    return merged
  }

  interface Pending {
    a: Seeded
    b: Seeded
    result?: { width: number; cell: number; connected: boolean }
  }
  const pairs: Pending[] = []
  seeded.forEach((a, i) => {
    for (const b of seeded.slice(i + 1)) pairs.push({ a, b })
  })
  const resolve = (width: number, cell: number, connected: boolean) => {
    for (const pair of pairs) {
      if (pair.result) continue
      if (find(pair.a.rep) === find(pair.b.rep)) {
        pair.result = { width, cell, connected }
      }
    }
  }

  const isSeed = new Uint8Array(size)
  for (const s of seeded) {
    for (const c of s.cells) {
      if (isSeed[c]) continue
      isSeed[c] = 1
      add(c)
    }
  }
  resolve(Infinity, seeded[0]?.rep ?? 0, true)

  const free: number[] = []
  for (let i = 0; i < size; i++) {
    if (grid.inside[i] && !grid.blocked[i] && !isSeed[i]) free.push(i)
  }
  const ordered = sortByKeyDescending(free, clearance2)
  const reachRadius = clearanceReachMinMm / 2
  let reach: Uint8Array | undefined
  const snapshot = () => {
    const roots = new Set(seeded.map((s) => find(s.rep)))
    reach = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
      if (parent[i]! >= 0 && roots.has(find(i))) reach[i] = 1
    }
  }
  for (const c of ordered) {
    const radius = Math.sqrt(clearance2[c]!) * cell
    if (!reach && radius < reachRadius) snapshot()
    if (add(c) && pairs.some((p) => !p.result)) resolve(2 * radius, c, true)
  }
  if (!reach) snapshot()

  if (pairs.some((p) => !p.result)) {
    // No free route: push through the thinnest blockage to find what's in
    // the way.
    const freeMask = new Uint8Array(size)
    const blockedInside: number[] = []
    for (let i = 0; i < size; i++) {
      if (!grid.inside[i]) continue
      if (grid.blocked[i]) blockedInside.push(i)
      else freeMask[i] = 1
    }
    const depth2 = squaredDistances(grid, freeMask)
    const negated = new Float64Array(size)
    let maxDepth = 0
    for (const c of blockedInside) maxDepth = Math.max(maxDepth, depth2[c]!)
    for (const c of blockedInside) negated[c] = maxDepth - depth2[c]!
    for (const c of sortByKeyDescending(blockedInside, negated)) {
      if (add(c)) resolve(0, c, false)
      if (pairs.every((p) => p.result)) break
    }
  }

  const routes: RouteResult[] = []
  for (const pair of pairs) {
    const result = pair.result
    if (!result || !Number.isFinite(result.width)) continue
    const centre = cellCentre(grid, result.cell)
    const searchRadius = result.connected
      ? Math.ceil(Math.sqrt(clearance2[result.cell]!)) + 2
      : 4
    // With no route, name what's in the way (and anything it abuts), not
    // the walls it runs into.
    const around = blockersAround(
      grid,
      result.cell,
      searchRadius,
      result.connected
        ? undefined
        : (label) => blockers[label - 1]?.kind !== "wall"
    )
    const first = around.first ? blockers[around.first.label - 1] : undefined
    const second = around.second ? blockers[around.second.label - 1] : undefined
    let width = result.width
    let pinch = centre
    let across: Point | undefined
    if (first && second && around.first && around.second) {
      const a = cellCentre(grid, around.first.cell)
      const b = cellCentre(grid, around.second.cell)
      const span = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (span > 0) across = [(b[0] - a[0]) / span, (b[1] - a[1]) / span]
      if (result.connected) {
        const gap = exactGap(
          first,
          second,
          centre,
          result.width / 2 + 4 * cell,
          walkingHeightMm
        )
        if (
          gap &&
          gap.distance > 0 &&
          Math.abs(gap.distance - width) <= 2 * cell
        ) {
          width = gap.distance
          pinch = [(gap.p[0] + gap.q[0]) / 2, (gap.p[1] + gap.q[1]) / 2]
          across = [
            (gap.q[0] - gap.p[0]) / gap.distance,
            (gap.q[1] - gap.p[1]) / gap.distance,
          ]
        }
      }
    }
    routes.push({
      from: pair.a.door,
      to: pair.b.door,
      width,
      connected: result.connected,
      pinch,
      blockers: [first, second].filter(
        (b): b is WalkwayBlocker => b !== undefined
      ),
      ...(across ? { across } : {}),
    })
  }

  let reachDistance2: Float64Array | undefined
  const reachable = (zone: readonly Point[]): boolean | undefined => {
    if (seeded.length === 0 || !reach) return undefined
    reachDistance2 ??= squaredDistances(grid, reach)
    const limit = (reachRadius + cell) / cell
    let found = false
    fillPolygon(grid, zone, (index) => {
      if (found || !grid.inside[index] || grid.blocked[index]) return
      if (Math.sqrt(reachDistance2![index]!) <= limit) found = true
    })
    return found
  }

  return { grid, routes, reachable }
}
