import type { Point } from "./angles"
import type { Bounds2 } from "./polygon"
import { cross, sub } from "./vec"

// Convex hulls and clipping for collision footprints.

/**
 * Convex hull (Andrew's monotone chain), clockwise on the plan (positive
 * shoelace area), without duplicate or collinear points. Fewer than three
 * distinct points come back as they are (deduplicated).
 */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const unique: Point[] = []
  for (const p of sorted) {
    const last = unique[unique.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) unique.push(p)
  }
  if (unique.length < 3) return unique

  const half = (input: readonly Point[]): Point[] => {
    const chain: Point[] = []
    for (const p of input) {
      while (chain.length >= 2) {
        const a = chain[chain.length - 2]!
        const b = chain[chain.length - 1]!
        // Pop while a → b → p doesn't turn the hull's way (keeps area > 0).
        if (cross(sub(b, a), sub(p, a)) <= 0) chain.pop()
        else break
      }
      chain.push(p)
    }
    chain.pop()
    return chain
  }

  const hull = [...half(unique), ...half([...unique].reverse())]
  return hull.length >= 3 ? hull : unique
}

/**
 * Clip a convex polygon to an axis-aligned rectangle (Sutherland–Hodgman).
 * Keeps the input's orientation. Returns [] when they don't overlap.
 */
export function clipToBounds(polygon: readonly Point[], box: Bounds2): Point[] {
  type Edge = {
    inside: (p: Point) => boolean
    cut: (a: Point, b: Point) => Point
  }
  const atX = (x: number) => (a: Point, b: Point) =>
    [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])] as Point
  const atZ = (z: number) => (a: Point, b: Point) =>
    [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]), z] as Point
  const edges: Edge[] = [
    { inside: (p) => p[0] >= box.minX, cut: atX(box.minX) },
    { inside: (p) => p[0] <= box.maxX, cut: atX(box.maxX) },
    { inside: (p) => p[1] >= box.minZ, cut: atZ(box.minZ) },
    { inside: (p) => p[1] <= box.maxZ, cut: atZ(box.maxZ) },
  ]

  let output: Point[] = [...polygon]
  for (const edge of edges) {
    const input = output
    output = []
    for (let i = 0; i < input.length; i++) {
      const current = input[i]!
      const previous = input[(i + input.length - 1) % input.length]!
      const currentIn = edge.inside(current)
      const previousIn = edge.inside(previous)
      if (currentIn) {
        if (!previousIn) output.push(edge.cut(previous, current))
        output.push(current)
      } else if (previousIn) {
        output.push(edge.cut(previous, current))
      }
    }
    if (output.length === 0) return []
  }
  return output
}

/**
 * Regular polygon that circumscribes a circle, clockwise on the plan, with
 * flat edges facing ±x and ±z — so its axis-aligned extent is exactly
 * ±radius (round tables sit flush against square walls).
 */
export function circumscribedPolygon(
  center: Point,
  radius: number,
  sides = 16
): Point[] {
  const step = (2 * Math.PI) / sides
  const r = radius / Math.cos(step / 2)
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i + 0.5) * step
    return [
      center[0] + r * Math.cos(angle),
      center[1] + r * Math.sin(angle),
    ] as Point
  })
}
