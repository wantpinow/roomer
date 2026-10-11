import type { Point } from "../geometry/angles"
import { pointSegmentDistance } from "../geometry/distance"
import { formatMm, formatNumber } from "../geometry/format"
import { containsPoint } from "../geometry/polygon"
import type { RoomGeometry } from "../geometry/room-geometry"
import { localRectToPlan, placementTransform } from "../geometry/transform"
import { deriveWalls, type Wall } from "../geometry/walls"
import {
  DEFAULT_FACING,
  isBeamFeature,
  isCeilingFeature,
  isFloorFeature,
  isWallFeature,
  type BeamFeature,
  type Feature,
  type WallFeature,
} from "../schema"

// Checks that a room's features make sense against its outline and ceiling.
// Every message names the feature, gives the numbers and says what to change,
// because the agent that dictated the room reads them verbatim.

export interface FeatureProblem {
  /** The feature(s) the problem is about. */
  featureIds: string[]
  message: string
}

/** Points this close to a wall count as on it (float noise, flush hearths). */
const BOUNDARY_TOLERANCE_MM = 1

/** Wall feature types that are holes in the wall and so can't overlap. */
const OPENING_TYPES = new Set<Feature["type"]>(["door", "window", "opening"])

const n = (value: number): string => formatNumber(value)

/** "door D1", "wall light WL2" — how features are named in messages. */
export function featureName(feature: Pick<Feature, "type" | "id">): string {
  return `${feature.type.replace(/-/g, " ")} ${feature.id}`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function isOutside(polygon: readonly Point[], point: Point): boolean {
  if (containsPoint(polygon, point)) return false
  const count = polygon.length
  for (let i = 0; i < count; i++) {
    const distance = pointSegmentDistance(
      point,
      polygon[i]!,
      polygon[(i + 1) % count]!
    )
    if (distance <= BOUNDARY_TOLERANCE_MM) return false
  }
  return true
}

function duplicateIdProblems(features: readonly Feature[]): FeatureProblem[] {
  const byId = new Map<string, Feature[]>()
  for (const feature of features) {
    byId.set(feature.id, [...(byId.get(feature.id) ?? []), feature])
  }
  return [...byId.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([id, group]) => ({
      featureIds: [id],
      message: `${group.length} features share the id ${id} (${group.map((f) => f.type).join(", ")}). Feature ids must be unique — rename all but one.`,
    }))
}

function wallFeatureProblems(
  feature: WallFeature,
  walls: readonly Wall[],
  ceilingHeight: number
): FeatureProblem[] {
  const name = capitalise(featureName(feature))
  const problems: FeatureProblem[] = []
  const wall = walls.find((w) => w.id === feature.wall)
  if (!wall) {
    problems.push({
      featureIds: [feature.id],
      message: `${name} is on ${feature.wall}, but this room's walls are ${walls.map((w) => w.id).join(", ")}.`,
    })
  } else {
    const end = feature.offset + feature.width
    const excess = end - wall.length
    if (excess > BOUNDARY_TOLERANCE_MM) {
      problems.push({
        featureIds: [feature.id],
        message: `${name} runs from ${formatMm(feature.offset)} to ${formatMm(end)} along ${wall.id} (offset ${formatMm(feature.offset)} + width ${formatMm(feature.width)}), but ${wall.id} is only ${formatMm(wall.length)} long. Reduce the offset or width by ${formatMm(Math.ceil(excess))}.`,
      })
    }
  }
  const top = feature.bottom + feature.height
  if (top > ceilingHeight) {
    problems.push({
      featureIds: [feature.id],
      message: `${name}'s top is at ${formatMm(top)} (bottom ${formatMm(feature.bottom)} + height ${formatMm(feature.height)}), above the ${formatMm(ceilingHeight)} ceiling. Lower it by ${formatMm(top - ceilingHeight)}.`,
    })
  }
  return problems
}

/** Openings (doors, windows, archways) on the same wall must not overlap. */
function overlappingOpeningProblems(
  features: readonly Feature[]
): FeatureProblem[] {
  const openings = features
    .filter(isWallFeature)
    .filter((f) => OPENING_TYPES.has(f.type))
  const problems: FeatureProblem[] = []
  openings.forEach((a, i) => {
    for (const b of openings.slice(i + 1)) {
      if (a.wall !== b.wall) continue
      const from = Math.max(a.offset, b.offset)
      const to = Math.min(a.offset + a.width, b.offset + b.width)
      const verticalOverlap =
        Math.min(a.bottom + a.height, b.bottom + b.height) -
        Math.max(a.bottom, b.bottom)
      if (to - from <= 0 || verticalOverlap <= 0) continue
      problems.push({
        featureIds: [a.id, b.id],
        message: `${capitalise(featureName(a))} (${formatMm(a.offset)}–${formatMm(a.offset + a.width)}) and ${featureName(b)} (${formatMm(b.offset)}–${formatMm(b.offset + b.width)}) overlap by ${formatMm(to - from)} along ${a.wall}. Openings in the same wall can't overlap — move one along the wall or narrow it.`,
      })
    }
  })
  return problems
}

function beamProblems(
  beam: BeamFeature,
  polygon: readonly Point[],
  ceilingHeight: number
): FeatureProblem[] {
  const name = capitalise(featureName(beam))
  const problems: FeatureProblem[] = []
  for (const end of [beam.start, beam.end]) {
    if (isOutside(polygon, [end[0], end[1]])) {
      problems.push({
        featureIds: [beam.id],
        message: `${name} ends at (${n(end[0])}, ${n(end[1])}), outside the room's outline. Beam ends must lie inside the room or on a wall.`,
      })
    }
  }
  if (beam.start[0] === beam.end[0] && beam.start[1] === beam.end[1]) {
    problems.push({
      featureIds: [beam.id],
      message: `${name} starts and ends at the same point. Give it a start and end, usually on two opposite walls.`,
    })
  }
  if (beam.drop >= ceilingHeight) {
    problems.push({
      featureIds: [beam.id],
      message: `${name} drops ${formatMm(beam.drop)} below a ${formatMm(ceilingHeight)} ceiling, which would reach the floor.`,
    })
  }
  return problems
}

function floorAndCeilingProblems(
  feature: Feature,
  polygon: readonly Point[],
  ceilingHeight: number
): FeatureProblem[] {
  const name = capitalise(featureName(feature))
  if (isBeamFeature(feature))
    return beamProblems(feature, polygon, ceilingHeight)
  if (isCeilingFeature(feature)) {
    return isOutside(polygon, [feature.x, feature.z])
      ? [
          {
            featureIds: [feature.id],
            message: `${name} at (${n(feature.x)}, ${n(feature.z)}) is outside the room's outline. Ceiling features need x/z inside the room.`,
          },
        ]
      : []
  }
  if (!isFloorFeature(feature)) return []
  const problems: FeatureProblem[] = []
  const transform = placementTransform({
    x: feature.x,
    z: feature.z,
    facing: feature.facing ?? DEFAULT_FACING,
    elevation: 0,
  })
  const outline = localRectToPlan(
    transform,
    -feature.width / 2,
    -feature.depth / 2,
    feature.width / 2,
    feature.depth / 2
  )
  const outside = outline.find((corner) => isOutside(polygon, corner))
  if (outside) {
    problems.push({
      featureIds: [feature.id],
      message: `${name} (centre ${n(feature.x)}, ${n(feature.z)}; ${formatMm(feature.width)} × ${formatMm(feature.depth)}) sticks out of the room: its corner at (${n(outside[0])}, ${n(outside[1])}) is outside the walls. Move it or make it smaller.`,
    })
  }
  if (feature.height > ceilingHeight) {
    problems.push({
      featureIds: [feature.id],
      message: `${name} is ${formatMm(feature.height)} tall, taller than the ${formatMm(ceilingHeight)} ceiling.`,
    })
  }
  return problems
}

/** Every problem with the room's features, attributed to feature ids. */
export function featureProblems(room: RoomGeometry): FeatureProblem[] {
  const walls = deriveWalls(room.corners)
  const polygon: Point[] = room.corners.map(([x, z]) => [x, z])
  return [
    ...duplicateIdProblems(room.features),
    ...room.features.flatMap((feature) =>
      isWallFeature(feature)
        ? wallFeatureProblems(feature, walls, room.ceilingHeight)
        : floorAndCeilingProblems(feature, polygon, room.ceilingHeight)
    ),
    ...overlappingOpeningProblems(room.features),
  ]
}

/**
 * Problems with a room's features as plain sentences for the agent; an empty
 * list means every feature fits the outline and ceiling.
 */
export function validateFeatures(room: RoomGeometry): string[] {
  return featureProblems(room).map((problem) => problem.message)
}

/**
 * Splits features into those that fit the room and those that don't (with
 * their problems) — used when a new outline would orphan wall features.
 */
export function partitionFeatures(room: RoomGeometry): {
  valid: Feature[]
  invalid: { feature: Feature; problems: string[] }[]
} {
  const problems = featureProblems(room)
  const valid: Feature[] = []
  const invalid: { feature: Feature; problems: string[] }[] = []
  for (const feature of room.features) {
    const own = problems
      .filter((p) => p.featureIds.includes(feature.id))
      .map((p) => p.message)
    if (own.length === 0) valid.push(feature)
    else invalid.push({ feature, problems: own })
  }
  return { valid, invalid }
}
