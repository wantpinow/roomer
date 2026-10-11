import type { Point } from "../geometry/angles"
import { bounds } from "../geometry/polygon"

// A square occupancy grid over the room for the walkway checks: cells are
// sampled at their centres, there's a one-cell ring of outside cells around
// the room's bounding box, and distances come from an exact Euclidean
// distance transform (Felzenszwalb & Huttenlocher), so the whole analysis
// stays a few milliseconds even for a long room at 25mm.

export interface Grid {
  cell: number
  /** x of the left edge of column 0. */
  originX: number
  /** z of the top edge of row 0. */
  originZ: number
  cols: number
  rows: number
  /** 1 = cell centre inside the room outline. */
  inside: Uint8Array
  /** 1 = blocked at walking height, or outside the room. */
  blocked: Uint8Array
  /** For blocked cells: index + 1 of what blocks it; 0 for free cells. */
  label: Int32Array
}

export function createGrid(polygon: readonly Point[], cell: number): Grid {
  const box = bounds(polygon)
  const cols = Math.ceil((box.maxX - box.minX) / cell) + 2
  const rows = Math.ceil((box.maxZ - box.minZ) / cell) + 2
  const size = cols * rows
  const grid: Grid = {
    cell,
    originX: box.minX - cell,
    originZ: box.minZ - cell,
    cols,
    rows,
    inside: new Uint8Array(size),
    blocked: new Uint8Array(size).fill(1),
    label: new Int32Array(size),
  }
  fillPolygon(grid, polygon, (index) => {
    grid.inside[index] = 1
    grid.blocked[index] = 0
  })
  return grid
}

export function cellCentre(grid: Grid, index: number): Point {
  const col = index % grid.cols
  const row = (index - col) / grid.cols
  return [
    grid.originX + (col + 0.5) * grid.cell,
    grid.originZ + (row + 0.5) * grid.cell,
  ]
}

/** Index of the cell containing a plan point, or -1 outside the grid. */
export function cellAt(grid: Grid, [x, z]: Point): number {
  const col = Math.floor((x - grid.originX) / grid.cell)
  const row = Math.floor((z - grid.originZ) / grid.cell)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1
  return row * grid.cols + col
}

/** Calls `visit` for every cell whose centre lies inside the outline. */
export function fillPolygon(
  grid: Grid,
  polygon: readonly Point[],
  visit: (index: number) => void
): void {
  if (polygon.length < 3) return
  const { cell, originX, originZ, cols, rows } = grid
  const box = bounds(polygon)
  const row0 = Math.max(0, Math.ceil((box.minZ - originZ) / cell - 0.5))
  const row1 = Math.min(rows - 1, Math.floor((box.maxZ - originZ) / cell - 0.5))
  const crossings: number[] = []
  for (let row = row0; row <= row1; row++) {
    const z = originZ + (row + 0.5) * cell
    crossings.length = 0
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!
      const b = polygon[(i + 1) % polygon.length]!
      if (a[1] > z !== b[1] > z) {
        crossings.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
      }
    }
    crossings.sort((p, q) => p - q)
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const col0 = Math.max(
        0,
        Math.ceil((crossings[k]! - originX) / cell - 0.5)
      )
      const col1 = Math.min(
        cols - 1,
        Math.floor((crossings[k + 1]! - originX) / cell - 0.5)
      )
      for (let col = col0; col <= col1; col++) visit(row * cols + col)
    }
  }
}

const FAR = 1e20

/** 1D squared distance transform of `f` (in place into `d`). */
function transform1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array
): void {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    while (s <= z[k]!) {
      k--
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++
    const dq = q - v[k]!
    d[q] = dq * dq + f[v[k]!]!
  }
}

/**
 * Squared distance (in cells²) from every cell centre to the nearest cell
 * where `isSource` is 1. Cells with no source anywhere get a huge value.
 */
export function squaredDistances(
  grid: Grid,
  isSource: Uint8Array
): Float64Array {
  const { cols, rows } = grid
  const out = new Float64Array(cols * rows)
  for (let i = 0; i < out.length; i++) out[i] = isSource[i] ? 0 : FAR
  const n = Math.max(cols, rows)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) f[row] = out[row * cols + col]!
    transform1d(f, rows, d, v, z)
    for (let row = 0; row < rows; row++) out[row * cols + col] = d[row]!
  }
  for (let row = 0; row < rows; row++) {
    const base = row * cols
    for (let col = 0; col < cols; col++) f[col] = out[base + col]!
    transform1d(f, cols, d, v, z)
    for (let col = 0; col < cols; col++) out[base + col] = d[col]!
  }
  return out
}

/** The 8 neighbours of an interior cell (callers never pass border cells). */
export function neighbours(grid: Grid): number[] {
  const c = grid.cols
  return [-c - 1, -c, -c + 1, -1, 1, c - 1, c, c + 1]
}
