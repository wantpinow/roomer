import type { Point } from "../../geometry/angles"
import { formatMm } from "../../geometry/format"
import type { LintIssue } from "../../schema"
import { makeSolid, type LintContext, type LintItem } from "../context"
import { conflictFor, moveText } from "../moves"
import { translate } from "../polygons"
import { makeIssue } from "../shared"
import type { RouteResult, WalkwayAnalysis, WalkwayBlocker } from "../walkway"

// W101 (no route at least walkwayMinMm wide between two doors) and I202
// (the route is usable but under walkwayComfortableMm).

/** Snap a direction to the nearest plan axis when it's within ~25° of it. */
function snapToAxis(direction: Point): Point {
  const [x, z] = direction
  if (Math.abs(x) >= 0.9) return [Math.sign(x), 0]
  if (Math.abs(z) >= 0.9) return [0, Math.sign(z)]
  return direction
}

function between(route: RouteResult): string {
  const names = route.blockers.map((b) => b.name)
  if (names.length === 2) return ` between ${names[0]} and ${names[1]}`
  if (names.length === 1) return ` beside ${names[0]}`
  return ""
}

function widenHint(
  ctx: LintContext,
  route: RouteResult,
  target: number
): string | undefined {
  const needed = Math.ceil(target - route.width)
  const [first, second] = route.blockers
  const movable = route.blockers
    .map((blocker, index) => ({ blocker, index }))
    .filter(
      (
        m
      ): m is {
        blocker: Extract<WalkwayBlocker, { kind: "item" }>
        index: number
      } => m.blocker.kind === "item"
    )
    .sort((a, b) => a.blocker.item.area - b.blocker.item.area)
  if (movable.length === 0) {
    if (!first) return undefined
    const fixed = second
      ? `${first.name} and ${second.name} are fixed parts of the room`
      : `${first.name} is a fixed part of the room`
    return `${fixed}, so this gap can't be widened — keep everything else clear of it.`
  }
  if (!route.across) {
    return `Move ${movable[0]!.blocker.name} to widen the gap by at least ${formatMm(needed)}.`
  }
  const { blocker, index } = movable[0]!
  // Blocker 0 moves against `across`, blocker 1 along it.
  const sign = index === 0 ? -1 : 1
  const direction = snapToAxis([route.across[0] * sign, route.across[1] * sign])
  const item: LintItem = blocker.item
  const offset: Point = [direction[0] * needed, direction[1] * needed]
  const parts = item.parts.map((p) =>
    makeSolid(translate(p.footprint, offset), p.y0, p.y1)
  )
  const conflict = conflictFor(ctx, item, parts)
  return moveText(ctx, {
    item,
    direction,
    distance: needed,
    ...(conflict ? { conflict } : {}),
  })
}

function routeIds(route: RouteResult) {
  const placementIds = route.blockers
    .filter((b) => b.kind === "item")
    .map((b) => (b.kind === "item" ? b.item.id : ""))
  const featureIds = [
    route.from.feature.id,
    route.to.feature.id,
    ...route.blockers.flatMap((b) =>
      b.kind === "obstacle" && b.obstacle.featureId
        ? [b.obstacle.featureId]
        : []
    ),
  ]
  return { placementIds, featureIds }
}

export function lintRoutes(
  ctx: LintContext,
  walkway: WalkwayAnalysis
): LintIssue[] {
  const { walkwayMinMm, walkwayComfortableMm } = ctx.thresholds
  const issues: LintIssue[] = []
  for (const route of walkway.routes) {
    // A door whose swing or doorway is already blocked (E004/E005) narrows
    // every route through it; that error says it better.
    if (
      ctx.reported.has(`door:${route.from.feature.id}`) ||
      ctx.reported.has(`door:${route.to.feature.id}`)
    ) {
      continue
    }
    const ends = `${route.from.name} and ${route.to.name}`
    const ids = routeIds(route)
    if (!route.connected) {
      const names = route.blockers.map((b) => b.name)
      const blocking =
        names.length === 2
          ? `${names[0]} and ${names[1]} block the way`
          : `${names[0] ?? "Something"} blocks the way`
      issues.push(
        makeIssue({
          code: "W101",
          message: `There's no walking route between ${ends}: ${blocking}.`,
          ...ids,
          hint: `Open a gap at least ${formatMm(walkwayMinMm)} wide there, e.g. by moving ${names[0] ?? "the items in the way"}.`,
          at: route.pinch,
        })
      )
      continue
    }
    const width = Math.round(route.width)
    if (width < walkwayMinMm) {
      issues.push(
        makeIssue({
          code: "W101",
          message: `The walking route between ${ends} narrows to ${formatMm(width)}${between(route)} — at least ${formatMm(walkwayMinMm)} is needed.`,
          ...ids,
          hint: widenHint(ctx, route, walkwayMinMm),
          at: route.pinch,
        })
      )
    } else if (width < walkwayComfortableMm) {
      issues.push(
        makeIssue({
          code: "I202",
          message: `The walking route between ${ends} narrows to ${formatMm(width)}${between(route)}: usable, but ${formatMm(walkwayComfortableMm)} is comfortable.`,
          ...ids,
          hint: widenHint(ctx, route, walkwayComfortableMm),
          at: route.pinch,
        })
      )
    }
  }
  return issues
}
