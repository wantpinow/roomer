import { describe, expect, it } from "vitest"

import { rectPolygon, type Point } from "../../src/geometry"
import {
  cellAt,
  cellCentre,
  createGrid,
  fillPolygon,
  squaredDistances,
} from "../../src/lint/grid"

describe("createGrid", () => {
  it("covers the outline's bounds plus a ring of outside cells", () => {
    const grid = createGrid(rectPolygon(0, 0, 1000, 500), 25)
    expect([grid.cols, grid.rows]).toEqual([42, 22])
    expect([grid.originX, grid.originZ]).toEqual([-25, -25])
    let inside = 0
    for (let i = 0; i < grid.inside.length; i++) {
      inside += grid.inside[i]!
      expect(grid.blocked[i]).toBe(1 - grid.inside[i]!)
    }
    expect(inside).toBe(40 * 20)
  })

  it("leaves the notch of an L-shaped room outside", () => {
    const l: Point[] = [
      [0, 0],
      [1000, 0],
      [1000, 500],
      [500, 500],
      [500, 1000],
      [0, 1000],
    ]
    const grid = createGrid(l, 50)
    expect(grid.inside[cellAt(grid, [250, 750])]).toBe(1)
    expect(grid.inside[cellAt(grid, [750, 750])]).toBe(0)
  })
})

describe("cellAt / cellCentre", () => {
  it("round-trip a point to the centre of its cell", () => {
    const grid = createGrid(rectPolygon(0, 0, 1000, 500), 25)
    const index = cellAt(grid, [110, 260])
    expect(cellCentre(grid, index)).toEqual([112.5, 262.5])
    expect(cellAt(grid, [-1000, 0])).toBe(-1)
  })
})

describe("fillPolygon", () => {
  it("visits exactly the cells whose centres are inside", () => {
    const grid = createGrid(rectPolygon(0, 0, 1000, 1000), 25)
    const visited: number[] = []
    fillPolygon(grid, rectPolygon(100, 100, 200, 160), (i) => visited.push(i))
    // Centres 112.5…187.5 (4 columns) × 112.5…137.5 (2 rows).
    expect(visited).toHaveLength(8)
  })
})

describe("squaredDistances", () => {
  it("matches a brute-force Euclidean distance transform", () => {
    const grid = createGrid(rectPolygon(0, 0, 400, 300), 25)
    const sources = new Uint8Array(grid.cols * grid.rows)
    // A pseudo-random sprinkle of source cells.
    let seed = 7
    for (let i = 0; i < sources.length; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      sources[i] = seed % 11 === 0 ? 1 : 0
    }
    const fast = squaredDistances(grid, sources)
    for (let i = 0; i < sources.length; i++) {
      let best = Infinity
      for (let j = 0; j < sources.length; j++) {
        if (!sources[j]) continue
        const dx = (i % grid.cols) - (j % grid.cols)
        const dz = Math.floor(i / grid.cols) - Math.floor(j / grid.cols)
        best = Math.min(best, dx * dx + dz * dz)
      }
      expect(fast[i]).toBe(best)
    }
  })
})
