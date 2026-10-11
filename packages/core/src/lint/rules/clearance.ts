import type { Point } from "../../geometry/angles"
import { formatMm } from "../../geometry/format"
import { ensureClockwiseOnPlan } from "../../geometry/polygon"
import { localRectToPlan } from "../../geometry/transform"
import { dot } from "../../geometry/vec"
import {
  assetClearanceZones,
  SIDE_DIRECTIONS,
  type ClearanceSide,
} from "../../assets/clearance"
import type { LintIssue } from "../../schema"
import {
  makeSolid,
  type LintContext,
  type LintItem,
  type Solid,
} from "../context"
import {
  bestMove,
  conflictFor,
  moveText,
  suggestMove,
  type MoveSuggestion,
} from "../moves"
import { difference, minWidth, translate } from "../polygons"
import {
  footprintOverlap,
  joinWords,
  makeIssue,
  regionsCentre,
} from "../shared"
import type { WalkwayAnalysis } from "../walkway"
import { penetrations } from "./room"

// W102: the space an item needs beside it (legroom in front of a sofa, room
// to pull a chair out or open a sideboard's doors) must be free of other
// furniture, obstacles and walls, and reachable from a door along a route
// at least clearanceReachMinMm wide. The zones are the asset's
// `clearanceZones` when it has them, else strips along its bounding box's
// `clearance` sides (see assets/clearance.ts).

export type { ClearanceSide }

export interface ClearanceZone {
  item: LintItem
  side: ClearanceSide
  /** The asset's zone name (custom zones only). */
  name?: string
  /** How far the zone reaches out from the item, mm. */
  depth: number
  /** Its size across and out (custom zones only), mm. */
  size?: { width: number; depth: number }
  solid: Solid
  /** Unit plan direction from the item out into the zone. */
  outward: Point
}

/** Outward unit normal of an item side on the plan (handles mirroring). */
export function sideNormal(item: LintItem, side: ClearanceSide): Point {
  const [lx, lz] = SIDE_DIRECTIONS[side]
  const origin = item.transform.toPlan(0, 0)
  const tip = item.transform.toPlan(lx, lz)
  return [tip[0] - origin[0], tip[1] - origin[1]]
}

export function clearanceZones(ctx: LintContext): ClearanceZone[] {
  const zones: ClearanceZone[] = []
  for (const item of ctx.items) {
    if (item.covering) continue
    for (const zone of assetClearanceZones(item.asset, item.local)) {
      const [x0, z0, x1, z1] = zone.rect
      const footprint = ensureClockwiseOnPlan(
        localRectToPlan(item.transform, x0, z0, x1, z1)
      )
      const across =
        zone.side === "front" || zone.side === "back" ? x1 - x0 : z1 - z0
      zones.push({
        item,
        side: zone.side,
        ...(zone.custom
          ? { name: zone.name, size: { width: across, depth: zone.depth } }
          : {}),
        depth: zone.depth,
        solid: makeSolid(footprint, 0, ctx.thresholds.walkingHeightMm),
        outward: sideNormal(item, zone.side),
      })
    }
  }
  return zones
}

function purpose(item: LintItem, side: ClearanceSide): string {
  const category = item.asset.category
  if (side === "front") {
    if (category === "sofa" || category === "chair") return "legroom"
    if (category === "storage" || category === "media") {
      return "room to open its doors and drawers"
    }
    if (category === "bed") return "room to get in and out"
  }
  if (side === "back" && category === "chair") return "room to pull it out"
  return "room to use it"
}

interface ZoneBlocker {
  name: string
  depth: number
  regions: Point[][]
  item?: LintItem
  featureId?: string
}

function zoneBlockers(ctx: LintContext, zone: ClearanceZone): ZoneBlocker[] {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const blockers: ZoneBlocker[] = []
  for (const other of ctx.items) {
    if (other.id === zone.item.id || other.covering) continue
    const regions: Point[][] = []
    let depth = 0
    for (const part of other.parts) {
      if (part.y0 >= zone.solid.y1 || part.y1 <= 0) continue
      const overlap = footprintOverlap(part, zone.solid, tolerance)
      if (!overlap) continue
      regions.push(...overlap.regions)
      depth = Math.max(depth, overlap.depth)
    }
    if (regions.length > 0) {
      blockers.push({ name: other.name, depth, regions, item: other })
    }
  }
  for (const obstacle of ctx.obstacles) {
    if (obstacle.kind === "skirting") continue
    if (obstacle.solid.y0 >= zone.solid.y1) continue
    const overlap = footprintOverlap(obstacle.solid, zone.solid, tolerance)
    if (!overlap) continue
    blockers.push({
      name: obstacle.name,
      depth: overlap.depth,
      regions: overlap.regions,
      ...(obstacle.featureId ? { featureId: obstacle.featureId } : {}),
    })
  }
  const outside = difference(zone.solid.footprint, [ctx.polygon]).filter(
    (region) => minWidth(region) > tolerance
  )
  if (outside.length > 0) {
    for (const [wall, depth] of penetrations(ctx, outside)) {
      // The item itself already goes through this wall (E003).
      if (ctx.reported.has(`E003:${zone.item.id}:${wall.id}`)) continue
      blockers.push({ name: wall.id, depth, regions: outside })
    }
  }
  return blockers.sort((a, b) => b.depth - a.depth)
}

/** Move the item itself back so its zone stops short of the blocker. */
function retreat(
  ctx: LintContext,
  zone: ClearanceZone,
  blocker: ZoneBlocker
): MoveSuggestion {
  const far = Math.max(...zone.solid.footprint.map((p) => dot(p, zone.outward)))
  const near = Math.min(
    ...blocker.regions.flat().map((p) => dot(p, zone.outward))
  )
  const distance = Math.max(1, Math.ceil(far - near - 1e-6))
  const direction: Point = [-zone.outward[0], -zone.outward[1]]
  const offset: Point = [direction[0] * distance, direction[1] * distance]
  const parts = zone.item.parts.map((p) =>
    makeSolid(translate(p.footprint, offset), p.y0, p.y1)
  )
  const conflict = conflictFor(ctx, zone.item, parts)
  return {
    item: zone.item,
    direction,
    distance,
    ...(conflict ? { conflict } : {}),
  }
}

export function lintClearances(
  ctx: LintContext,
  walkway: WalkwayAnalysis | undefined
): LintIssue[] {
  const issues: LintIssue[] = []
  for (const zone of clearanceZones(ctx)) {
    const needs = zone.name
      ? `${zone.item.name} needs its '${zone.name}' zone free (${formatMm(zone.size?.width ?? 0)} wide, ${formatMm(zone.depth)} out at its ${zone.side})`
      : `${zone.item.name} needs ${formatMm(zone.depth)} free at its ${zone.side} (${purpose(zone.item, zone.side)})`
    const all = zoneBlockers(ctx, zone)
    // An item overlapping this one (E001) is in its clearance too; the
    // overlap error already covers it.
    const blockers = all.filter(
      (b) => !b.item || !ctx.reported.has(`E001:${zone.item.id}:${b.item.id}`)
    )
    if (all.length > 0 && blockers.length === 0) continue
    if (blockers.length > 0) {
      const main = blockers[0]!
      const move = bestMove([
        main.item
          ? suggestMove(ctx, main.item, [zone.solid], {
              collides: (part, solid) =>
                part.y0 < solid.y1 &&
                part.y1 > 0 &&
                footprintOverlap(
                  part,
                  solid,
                  ctx.thresholds.overlapToleranceMm
                ) !== undefined,
            })
          : undefined,
        retreat(ctx, zone, main),
      ])
      const inTheWay = joinWords(
        blockers.map((b, i) => {
          const depth = formatMm(Math.round(b.depth))
          return i === 0
            ? `${b.name} is ${depth} into it`
            : `${b.name} ${depth}`
        })
      )
      issues.push(
        makeIssue({
          code: "W102",
          message: `${needs}, but ${inTheWay}.`,
          placementIds: [
            zone.item.id,
            ...blockers.flatMap((b) => (b.item ? [b.item.id] : [])),
          ],
          featureIds: blockers.flatMap((b) =>
            b.featureId ? [b.featureId] : []
          ),
          hint: move && moveText(ctx, move),
          at: regionsCentre(blockers.flatMap((b) => b.regions)),
        })
      )
      continue
    }
    // Only the front (legroom, doors and drawers) has to be walkable to;
    // a chair's back or a cabinet's side is used from beside it.
    if (zone.side !== "front") continue
    if (walkway?.reachable(zone.solid.footprint) === false) {
      const reach = ctx.thresholds.clearanceReachMinMm
      issues.push(
        makeIssue({
          code: "W102",
          message: `${needs}, but no route at least ${formatMm(reach)} wide leads there from a door.`,
          placementIds: [zone.item.id],
          hint: `Open a way in at least ${formatMm(reach)} wide to the ${zone.name ? `'${zone.name}' zone` : zone.side} of ${zone.item.name} by moving the items that hem it in.`,
          at: regionsCentre([zone.solid.footprint]),
        })
      )
    }
  }
  return issues
}
