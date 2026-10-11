import type { Point } from "../../geometry/angles"
import { polygonSegmentDistance } from "../../geometry/distance"
import { formatMm } from "../../geometry/format"
import { add, scale } from "../../geometry/vec"
import { toWallFrame } from "../../geometry/walls"
import type { LintIssue } from "../../schema"
import type { DoorZone, LintContext, LintItem } from "../context"
import { moveText, suggestMove } from "../moves"
import { makeIssue, regionsCentre, solidOverlap, yOverlap } from "../shared"

// E004 (an item is inside the swing of a door that opens into the room) and
// E005 (an item stands in the doorway zone in front of a door or opening).

/** How far a door can open (degrees, 0–90) before its leaf hits the item. */
function openingAngle(door: DoorZone, item: LintItem): number {
  const top = door.feature.bottom + door.feature.height
  const parts = item.parts.filter(
    (p) => yOverlap(p, { y0: door.feature.bottom, y1: top }) > 0
  )
  let limit = 90
  for (const swing of door.swings) {
    for (let angle = 1; angle <= 90; angle++) {
      const r = (angle * Math.PI) / 180
      const direction = add(
        scale(swing.closed, Math.cos(r)),
        scale(swing.open, Math.sin(r))
      )
      const tip = add(swing.hinge, scale(direction, swing.radius))
      const hits = parts.some(
        (p) => polygonSegmentDistance(p.footprint, swing.hinge, tip) < 0.5
      )
      if (hits) {
        limit = Math.min(limit, angle - 1)
        break
      }
    }
  }
  return limit
}

export function lintDoorSwings(ctx: LintContext): LintIssue[] {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const issues: LintIssue[] = []
  for (const door of ctx.doors) {
    if (door.swingSolids.length === 0) continue
    for (const item of ctx.items) {
      if (item.covering) continue
      const regions: Point[][] = []
      for (const part of item.parts) {
        for (const swing of door.swingSolids) {
          const overlap = solidOverlap(part, swing, tolerance)
          if (overlap) regions.push(...overlap.regions)
        }
      }
      if (regions.length === 0) continue
      ctx.reported.add(`E004:${item.id}:${door.feature.id}`)
      ctx.reported.add(`door:${door.feature.id}`)
      const angle = openingAngle(door, item)
      const move = suggestMove(ctx, item, door.swingSolids)
      issues.push(
        makeIssue({
          code: "E004",
          message:
            angle === 0
              ? `${item.name} is in the swing of ${door.name}: the door can't open at all.`
              : angle < 90
                ? `${item.name} is in the swing of ${door.name}: the door can only open about ${angle}° before hitting it.`
                : `${item.name} is inside the swing arc of ${door.name}.`,
          placementIds: [item.id],
          featureIds: [door.feature.id],
          hint: move && moveText(ctx, move, door.wall),
          at: regionsCentre(regions),
        })
      )
    }
  }
  return issues
}

export function lintDoorways(ctx: LintContext): LintIssue[] {
  const tolerance = ctx.thresholds.overlapToleranceMm
  const depth = ctx.thresholds.doorwayDepthMm
  const issues: LintIssue[] = []
  for (const door of ctx.doors) {
    for (const item of ctx.items) {
      if (item.covering) continue
      if (ctx.reported.has(`E004:${item.id}:${door.feature.id}`)) continue
      const regions: Point[][] = []
      for (const part of item.parts) {
        const overlap = solidOverlap(part, door.doorway, tolerance)
        if (overlap) regions.push(...overlap.regions)
      }
      if (regions.length === 0) continue
      ctx.reported.add(`door:${door.feature.id}`)
      const nearest = Math.max(
        0,
        Math.round(
          Math.min(
            ...regions.flat().map((p) => toWallFrame(door.wall, p).inset)
          )
        )
      )
      const kind = door.feature.type === "door" ? "doorway" : "opening"
      const move = suggestMove(ctx, item, [door.doorway])
      issues.push(
        makeIssue({
          code: "E005",
          message: `${item.name} blocks the ${kind} of ${door.name}: it comes within ${formatMm(nearest)} of it, and ${formatMm(depth)} in front of a ${kind} must stay clear.`,
          placementIds: [item.id],
          featureIds: [door.feature.id],
          hint: move && moveText(ctx, move, door.wall),
          at: regionsCentre(regions),
        })
      )
    }
  }
  return issues
}
