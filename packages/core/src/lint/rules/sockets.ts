import type { Point } from "../../geometry/angles"
import { localRectToPlan, placementTransform } from "../../geometry/transform"
import { wallFeatureFootprint, wallPoint } from "../../geometry/walls"
import {
  DEFAULT_FACING,
  isWallFeature,
  type Feature,
  type LintIssue,
} from "../../schema"
import {
  featureRef,
  findWallOf,
  makeSolid,
  type LintContext,
  type Solid,
} from "../context"
import { moveText, suggestMove } from "../moves"
import { footprintOverlap, joinWords, makeIssue, solidOverlap } from "../shared"

// I201: outlets (sockets, switches, data and aerial points, floor sockets)
// hidden behind or under an item. Informational — you may still need to
// reach them — so it lists every outlet each item hides.

/** How far in front of a wall outlet a hand (and a plug) needs. */
export const OUTLET_ZONE_MM = 150

const OUTLET_TYPES = new Set<Feature["type"]>([
  "socket",
  "switch",
  "data",
  "aerial",
])

interface Outlet {
  feature: Feature
  zone: Solid
  /** Floor sockets are covered by anything on the floor, rugs included. */
  floor: boolean
  at: Point
}

function outlets(ctx: LintContext): Outlet[] {
  const found: Outlet[] = []
  for (const feature of ctx.room.features) {
    if (isWallFeature(feature)) {
      if (!OUTLET_TYPES.has(feature.type)) continue
      const wall = findWallOf(ctx.walls, feature)
      if (!wall) continue
      found.push({
        feature,
        zone: makeSolid(
          wallFeatureFootprint(wall, feature, OUTLET_ZONE_MM),
          feature.bottom,
          feature.bottom + feature.height
        ),
        floor: false,
        at: wallPoint(wall, feature.offset + feature.width / 2),
      })
    } else if (feature.type === "floor-socket") {
      const transform = placementTransform({
        x: feature.x,
        z: feature.z,
        facing: feature.facing ?? DEFAULT_FACING,
        elevation: 0,
      })
      found.push({
        feature,
        zone: makeSolid(
          localRectToPlan(
            transform,
            -feature.width / 2,
            -feature.depth / 2,
            feature.width / 2,
            feature.depth / 2
          ),
          0,
          feature.height
        ),
        floor: true,
        at: [feature.x, feature.z],
      })
    }
  }
  return found
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

export function lintHiddenOutlets(ctx: LintContext): LintIssue[] {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const all = outlets(ctx)
  const issues: LintIssue[] = []
  for (const item of ctx.items) {
    const hidden = all.filter((outlet) =>
      item.parts.some((part) =>
        outlet.floor
          ? part.y0 < ctx.thresholds.walkingHeightMm &&
            footprintOverlap(part, outlet.zone, tolerance) !== undefined
          : !item.covering &&
            solidOverlap(part, outlet.zone, 0) !== undefined &&
            footprintOverlap(part, outlet.zone, tolerance) !== undefined
      )
    )
    if (hidden.length === 0) continue
    const names = hidden.map((o) => featureRef(o.feature))
    const move = suggestMove(
      ctx,
      item,
      hidden.map((o) => o.zone),
      {
        collides: (part, zone) =>
          footprintOverlap(part, zone, tolerance) !== undefined &&
          (item.covering || (part.y0 < zone.y1 && part.y1 > zone.y0)),
      }
    )
    issues.push(
      makeIssue({
        code: "I201",
        message: `${item.name} hides ${joinWords(names)} — you may still need to reach ${hidden.length === 1 ? "it" : "them"}.`,
        placementIds: [item.id],
        featureIds: hidden.map((o) => o.feature.id),
        hint: move
          ? `Plug in before placing it, or uncover ${hidden.length === 1 ? "it" : "them"}: ${lowerFirst(moveText(ctx, move))}`
          : "Plug in before placing it.",
        at: hidden[0]!.at,
      })
    )
  }
  return issues
}
