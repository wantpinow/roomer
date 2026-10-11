import { assetLocalBounds } from "@roomer/core/assets"
import {
  deriveWalls,
  normalizeBearing,
  placementTransform,
  toWallFrame,
  type Point,
  type RoomGeometry,
  type Wall,
} from "@roomer/core/geometry"
import {
  placementContext,
  resolvePosition,
  slugify,
  uniqueId,
  type Pose,
} from "@roomer/core/placement"
import {
  isCeilingFeature,
  type AddOp,
  type AssetSpec,
  type LintIssue,
  type LintReport,
  type LintSeverity,
  type Placement,
  type PlacementPosition,
} from "@roomer/core/schema"

import { formatMm } from "../format/length"
import { snapMm } from "./snap"

// Placing a new item on the plan: where the ghost goes for a pointer
// position (smart snapping to walls and ceiling fittings), the pose core
// resolves for it, the `add` op a click sends, and what lint thinks of it.
// All maths beyond picking the snap target is core's (`resolvePosition`).

/** A floor item's back face within this of a wall snaps it against the wall. */
export const WALL_SNAP_MM = 250
/** A ceiling item within this of a fitting centres on it. */
export const CEILING_SNAP_MM = 600
/** R turns a free-standing ghost a quarter; Shift+R a fine step. */
export const ROTATE_STEP_COARSE = 90
export const ROTATE_STEP_FINE = 15
/** Id the ghost wears in previews and lint (a valid slug, never stored). */
export const GHOST_ID = "placing-ghost"

/** What placing needs to know about an asset before its full spec loads. */
export type PlacingAsset = Pick<
  AssetSpec,
  "name" | "category" | "mount" | "dims"
>

/**
 * Height of a wall item's centre above the floor, by what it is: a TV at
 * sitting eye level, shelves a little higher, mirrors and art at standing
 * eye level, wall lights above that.
 */
export function defaultWallCentre(asset: Pick<AssetSpec, "category">): number {
  switch (asset.category) {
    case "media":
      return 1100
    case "storage":
      return 1200
    case "lighting":
      return 1700
    default:
      return 1450
  }
}

/** The elevation (bottom edge) that puts a wall item's centre at its default. */
export function defaultWallElevation(
  asset: Pick<AssetSpec, "category" | "dims">
): number {
  return Math.max(0, Math.round(defaultWallCentre(asset) - asset.dims.h / 2))
}

export type SnapTarget =
  | { kind: "wall"; wall: Wall; along: number }
  | { kind: "feature"; featureId: string; at: Point }
  | { kind: "free" }

export interface PlacingDecision {
  /** What the `add` op will carry; core resolves it to a pose. */
  position: PlacementPosition
  /** What the ghost snapped to, for the plan's indicator. */
  snap: SnapTarget
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Distance from a point to a wall segment, and where along it. */
function wallDistance(wall: Wall, point: Point) {
  const frame = toWallFrame(wall, point)
  const along = clamp(frame.along, 0, wall.length)
  const off = Math.hypot(
    point[0] - (wall.start[0] + wall.dir[0] * along),
    point[1] - (wall.start[1] + wall.dir[1] * along)
  )
  return { ...frame, distance: off }
}

/** `at` along a wall that keeps an item of `width` between its ends. */
function alongFor(wall: Wall, along: number, width: number, grid: number) {
  const half = Math.min(width / 2, wall.length / 2)
  return clamp(
    snapMm(along, grid),
    Math.ceil(half),
    Math.floor(wall.length - half)
  )
}

/**
 * Where a new item goes for a pointer at `pointer` (room mm, the item's
 * centre):
 * - wall-mounted items always go on the nearest wall, at a default height;
 * - ceiling items centre on a fitting within 600mm, else hang where pointed;
 * - rugs go exactly where pointed (they never snap to walls);
 * - other floor items snap back-to-wall when their back would be within
 *   250mm of a wall, else stand where pointed, turned to `facing`.
 * Positions snap to the 10mm grid unless `free` (Alt).
 */
export function decidePlacement({
  asset,
  pointer,
  facing,
  room,
  free = false,
}: {
  asset: PlacingAsset
  pointer: Point
  facing: number
  room: Pick<RoomGeometry, "corners" | "features">
  free?: boolean
}): PlacingDecision {
  const grid = free ? 1 : 10
  const walls = deriveWalls(room.corners)
  const atPointer: PlacingDecision = {
    position: {
      mode: "at",
      x: snapMm(pointer[0], grid),
      z: snapMm(pointer[1], grid),
      facing: normalizeBearing(facing),
    },
    snap: { kind: "free" },
  }

  if (asset.mount === "wall") {
    const nearest = walls
      .map((wall) => ({ wall, ...wallDistance(wall, pointer) }))
      .sort((a, b) => a.distance - b.distance)[0]
    if (!nearest) return atPointer
    const at = alongFor(nearest.wall, nearest.along, asset.dims.w, grid)
    return {
      position: {
        mode: "onWall",
        wall: nearest.wall.id,
        at,
        elevation: defaultWallElevation(asset),
      },
      snap: { kind: "wall", wall: nearest.wall, along: at },
    }
  }

  if (asset.mount === "ceiling") {
    const fitting = room.features
      .filter(isCeilingFeature)
      .filter((f) => f.type !== "smoke-alarm")
      .map((f) => ({ f, d: Math.hypot(f.x - pointer[0], f.z - pointer[1]) }))
      .filter(({ d }) => d <= CEILING_SNAP_MM)
      .sort((a, b) => a.d - b.d)[0]
    if (!fitting) return atPointer
    return {
      position: {
        mode: "centerOn",
        feature: fitting.f.id,
        facing: normalizeBearing(facing),
      },
      snap: {
        kind: "feature",
        featureId: fitting.f.id,
        at: [fitting.f.x, fitting.f.z],
      },
    }
  }

  if (asset.mount === "floor-covering") return atPointer

  // Floor items: back to the nearest wall the item's back would reach.
  const halfDepth = asset.dims.d / 2
  const candidate = walls
    .map((wall) => ({ wall, ...toWallFrame(wall, pointer) }))
    .filter(
      (c) =>
        c.along >= 0 &&
        c.along <= c.wall.length &&
        c.inset > -WALL_SNAP_MM &&
        c.inset - halfDepth <= WALL_SNAP_MM
    )
    .sort((a, b) => a.inset - b.inset)[0]
  if (!candidate) return atPointer
  const at = alongFor(candidate.wall, candidate.along, asset.dims.w, grid)
  return {
    position: {
      mode: "against",
      wall: candidate.wall.id,
      at,
      anchor: "center",
    },
    snap: { kind: "wall", wall: candidate.wall, along: at },
  }
}

/**
 * A stand-in spec from an asset's overall size, for resolving the ghost
 * before the full model has loaded (bounds are what resolving reads).
 */
export function boundsSpec(asset: PlacingAsset): AssetSpec {
  const { w, d, h } = asset.dims
  return {
    ...asset,
    geometry: {
      kind: "parts",
      parts: [
        {
          shape: "box",
          name: "bounds",
          position: [0, Math.round(h / 2), 0],
          size: [w, h, d],
        },
      ],
    },
  }
}

/** The pose core gives a decision, or null if core refuses it. */
export function resolveGhost(
  decision: PlacingDecision,
  spec: AssetSpec,
  room: RoomGeometry,
  placements: readonly Placement[]
): Pose | null {
  try {
    return resolvePosition(
      decision.position,
      spec,
      placementContext(room, placements)
    )
  } catch {
    return null
  }
}

/** The ghost as a placement, labelled with the asset's name for lint. */
export function ghostPlacement(
  assetId: string,
  name: string,
  pose: Pose
): Placement {
  return { id: GHOST_ID, assetId, label: name, ...pose }
}

/** An item-local outline (e.g. a row's `footprint`) placed at a pose. */
export function placeOutline(
  rings: readonly (readonly Point[])[],
  pose: Pose
): Point[][] {
  const transform = placementTransform(pose)
  return rings.map((ring) => ring.map(([x, z]) => transform.toPlan(x, z)))
}

/** The asset's local outline (bounding rectangle) when no sketch is given. */
export function boundsOutline(spec: AssetSpec): Point[][] {
  const b = assetLocalBounds(spec)
  return [
    [
      [b.min[0], b.min[2]],
      [b.max[0], b.min[2]],
      [b.max[0], b.max[2]],
      [b.min[0], b.max[2]],
    ],
  ]
}

const SEVERITY_RANK: Record<LintSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}

/**
 * What lint says about the ghost: the worst severity of the issues it is
 * involved in (null when none) and the most severe of them.
 */
export function ghostVerdict(report: LintReport | undefined): {
  severity: LintSeverity | null
  issue: LintIssue | undefined
} {
  const issues = (report?.issues ?? [])
    .filter((issue) => issue.placementIds.includes(GHOST_ID))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const issue = issues[0]
  return { severity: issue?.severity ?? null, issue }
}

/** The `add` op a click sends, with a readable id unique in the layout. */
export function addOpFor(
  assetId: string,
  name: string,
  position: PlacementPosition,
  takenIds: Iterable<string>
): AddOp & { id: string } {
  return {
    op: "add",
    id: uniqueId(slugify(name), new Set(takenIds)),
    asset: assetId,
    position,
  }
}

/** A short readout of where the ghost will go, for the cursor caption. */
export function describeDecision(
  decision: PlacingDecision,
  pose: Pick<Pose, "facing" | "elevation">
): string {
  const position = decision.position
  switch (position.mode) {
    case "against":
      return `Back to ${position.wall}`
    case "onWall":
      return `On ${position.wall} · bottom at ${formatMm(position.elevation)}`
    case "centerOn":
      return position.feature ? `Centred on ${position.feature}` : "Centred"
    default:
      return pose.elevation > 0
        ? `Free · ${formatMm(pose.elevation)} up`
        : `Free · facing ${Math.round(pose.facing)}°`
  }
}

/** Turn a free-standing ghost clockwise by `delta` degrees. */
export function turnFacing(facing: number, delta: number): number {
  return normalizeBearing(facing + delta)
}
