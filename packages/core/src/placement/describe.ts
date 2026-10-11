import { bearingDelta, bearingOf, normalizeBearing } from "../geometry/angles"
import { polygonSegmentDistance } from "../geometry/distance"
import { formatDegrees, formatMm } from "../geometry/format"
import type { PlacementPose } from "../geometry/transform"
import { toWallFrame, type Wall } from "../geometry/walls"
import type { AssetSpec, WallId } from "../schema"
import type { PlacementContext } from "./context"
import { worldShapes, type WorldShape } from "./world"

// Plain-English readouts of where an item sits relative to the walls, for
// the agent: "back against W6 (18mm off the plaster), centred 2,400mm along,
// facing 90° (into the room)". Gaps come from the item's actual footprint.

export interface WallRelation {
  wall: WallId
  /** Footprint to plaster, mm; negative when the item goes through the wall. */
  gapMm: number
  /** Middle of the item's extent along the wall, mm from its start corner. */
  along: number
  /** The item's extent along the wall, mm from its start corner. */
  span: [number, number]
}

export interface PlacementRelation {
  nearestWall: WallRelation
  /** Walls the item is against (within the skirting depth + 5mm). */
  touchingWalls: WallId[]
  facingDescription: string
}

/** Slack beyond the skirting depth that still counts as "against" a wall. */
export const TOUCH_TOLERANCE_MM = 5

function relationTo(wall: Wall, shapes: readonly WorldShape[]): WallRelation {
  const frames = shapes.flatMap((s) =>
    s.footprint.map((p) => toWallFrame(wall, p))
  )
  const alongs = frames.map((f) => f.along)
  const from = Math.min(...alongs)
  const to = Math.max(...alongs)
  const behind = frames
    .filter((f) => f.inset < 0 && f.along >= 0 && f.along <= wall.length)
    .map((f) => f.inset)
  const gap =
    behind.length > 0
      ? Math.min(...behind)
      : Math.min(
          ...shapes.map((s) =>
            polygonSegmentDistance(s.footprint, wall.start, wall.end)
          )
        )
  return {
    wall: wall.id,
    gapMm: Math.round(gap) || 0,
    along: Math.round((from + to) / 2) || 0,
    span: [Math.round(from) || 0, Math.round(to) || 0],
  }
}

/** Which side of the item faces the wall. */
function sideTowards(facing: number, wall: Wall): string {
  const delta = normalizeBearing(facing - wall.inwardBearing)
  if (delta <= 45 || delta >= 315) return "back"
  if (delta < 135) return "left side"
  if (delta <= 225) return "front"
  return "right side"
}

function facingWords(facing: number, wall: Wall): string {
  const fromInward = bearingDelta(facing, wall.inwardBearing)
  if (fromInward <= 45) return "into the room"
  if (fromInward >= 135) return `towards ${wall.id}`
  return bearingDelta(facing, bearingOf(wall.dir)) < 90
    ? `along ${wall.id} towards ${wall.endCorner}`
    : `along ${wall.id} towards ${wall.startCorner}`
}

export function describePlacement(
  placement: PlacementPose,
  asset: Pick<AssetSpec, "geometry">,
  ctx: Pick<PlacementContext, "room" | "walls">
): PlacementRelation {
  const shapes = worldShapes(placement, asset)
  const touchLimit = ctx.room.skirting.depth + TOUCH_TOLERANCE_MM
  const relations = ctx.walls.map((wall) => ({
    wall,
    relation: relationTo(wall, shapes),
  }))

  // Nearest wall; on a tie (e.g. in a corner) prefer the one behind the item.
  const nearest = relations.reduce((best, candidate) => {
    const diff = candidate.relation.gapMm - best.relation.gapMm
    if (diff < -1) return candidate
    if (diff > 1) return best
    const behindCandidate = bearingDelta(
      placement.facing,
      candidate.wall.inwardBearing
    )
    const behindBest = bearingDelta(placement.facing, best.wall.inwardBearing)
    return behindCandidate < behindBest ? candidate : best
  })

  const { wall, relation } = nearest
  const side = sideTowards(placement.facing, wall)
  const gap = relation.gapMm
  const facing = `facing ${formatDegrees(placement.facing)} (${facingWords(placement.facing, wall)})`
  let where: string
  if (gap < 0) {
    where = `${side} ${formatMm(-gap)} through ${wall.id}, ${formatMm(relation.along)} along`
  } else if (gap <= touchLimit) {
    const offPlaster =
      gap === 0 ? "flush with the plaster" : `${formatMm(gap)} off the plaster`
    where = `${side} against ${wall.id} (${offPlaster}), centred ${formatMm(relation.along)} along`
  } else {
    where = `${formatMm(gap)} from ${wall.id} (the nearest wall, ${side} towards it), level with ${formatMm(relation.along)} along`
  }

  return {
    nearestWall: relation,
    touchingWalls: relations
      .filter((r) => r.relation.gapMm <= touchLimit)
      .map((r) => r.wall.id),
    facingDescription: `${where}, ${facing}`,
  }
}
