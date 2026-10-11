import type { Point } from "../geometry/angles"
import { formatMm } from "../geometry/format"
import { area, segmentsIntersect } from "../geometry/polygon"
import { distance } from "../geometry/vec"
import type { Vec2 } from "../schema"

// Sanity checks for a solved (or hand-entered) room outline. Each problem is
// a plain sentence the agent can act on; an empty list means the outline is
// usable.

export const MIN_WALL_LENGTH_MM = 100
export const MIN_ROOM_AREA_MM2 = 1_000_000

export function validateShell(corners: readonly Vec2[]): string[] {
  const n = corners.length
  if (n < 3) {
    return [
      `A room needs at least 3 corners, but only ${n} ${n === 1 ? "was" : "were"} given.`,
    ]
  }

  const problems: string[] = []
  const points: Point[] = corners.map(([x, z]) => [x, z])

  points.forEach((start, i) => {
    const end = points[(i + 1) % n]!
    const wallLength = distance(start, end)
    if (wallLength < MIN_WALL_LENGTH_MM) {
      problems.push(
        `W${i + 1} (C${i + 1} → C${((i + 1) % n) + 1}) is only ${formatMm(wallLength)} long; walls must be at least ${MIN_WALL_LENGTH_MM}mm. Check for a repeated or mistyped corner.`
      )
    }
  })

  const crossing = firstCrossing(points)
  if (crossing) {
    problems.push(
      `Walls W${crossing[0] + 1} and W${crossing[1] + 1} cross each other, so the outline isn't a simple room shape. Check the corner order and coordinates.`
    )
  }

  // A crossed outline's area is meaningless, so only check simple ones.
  const floorArea = area(points)
  if (!crossing && floorArea < MIN_ROOM_AREA_MM2) {
    problems.push(
      `The floor area is ${(floorArea / 1e6).toFixed(2)}m², below the 1m² minimum. Are the measurements in millimetres?`
    )
  }
  return problems
}

/** Indices of the first pair of non-adjacent walls that intersect. */
function firstCrossing(points: readonly Point[]): [number, number] | undefined {
  const n = points.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // adjacent through C1
      const intersects = segmentsIntersect(
        points[i]!,
        points[(i + 1) % n]!,
        points[j]!,
        points[(j + 1) % n]!
      )
      if (intersects) return [i, j]
    }
  }
  return undefined
}
