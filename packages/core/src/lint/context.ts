import { assetLocalBounds, type Aabb3 } from "../assets/bounds"
import type { Point } from "../geometry/angles"
import { bounds, type Bounds2 } from "../geometry/polygon"
import type { RoomGeometry } from "../geometry/room-geometry"
import {
  localRectToPlan,
  placementTransform,
  type PlacementTransform,
} from "../geometry/transform"
import {
  deriveWalls,
  wallFeatureFootprint,
  wallPoint,
  type Wall,
} from "../geometry/walls"
import { worldShapes } from "../placement/world"
import {
  DEFAULT_FACING,
  LINT_THRESHOLDS,
  isWallFeature,
  type AssetSpec,
  type DoorFeature,
  type Feature,
  type OpeningFeature,
  type Placement,
  type WallFeature,
} from "../schema"
import { isConvex, sectorPolygon } from "./polygons"

// Everything the rules share, computed once per lint run: walls, the room
// outline, each item's per-part solids in room space, the room's fixed
// obstacles (radiators, piers, hearths, sills, skirting) and the keep-out
// zones of doors.

export type LintThresholds = {
  -readonly [K in keyof typeof LINT_THRESHOLDS]: number
}

/** A footprint extruded between two heights, in room space. */
export interface Solid {
  footprint: Point[]
  bounds: Bounds2
  y0: number
  y1: number
  convex: boolean
}

export function makeSolid(footprint: Point[], y0: number, y1: number): Solid {
  return {
    footprint,
    bounds: bounds(footprint),
    y0,
    y1,
    convex: isConvex(footprint),
  }
}

export interface LintItem {
  id: string
  placement: Placement
  asset: AssetSpec
  /** label ?? asset name, plus the id when two items share a name. */
  name: string
  /** Rugs: they only collide with other rugs. */
  covering: boolean
  parts: (Solid & { part: string })[]
  bounds: Bounds2
  y0: number
  y1: number
  /** Item-local bounds of the asset (unmirrored frame). */
  local: Aabb3
  transform: PlacementTransform
  /** Footprint area of the item's local bounding rectangle, mm². */
  area: number
}

export type ObstacleKind =
  | "radiator"
  | "obstacle"
  | "hearth"
  | "floor-obstacle"
  | "sill"
  | "skirting"

export interface Obstacle {
  key: string
  kind: ObstacleKind
  featureId?: string
  wall?: Wall
  name: string
  solid: Solid
}

export type Entrance = DoorFeature | OpeningFeature

/** A door or opening with its wall and the zones in front of it. */
export interface DoorZone {
  feature: Entrance
  wall: Wall
  name: string
  /** Doorway rectangle (width × doorwayDepth) inside the room. */
  doorway: Solid
  /** Swing sectors inside the room (doors that swing in). */
  swings: { hinge: Point; closed: Point; open: Point; radius: number }[]
  swingSolids: Solid[]
}

export interface LintContext {
  room: RoomGeometry
  walls: Wall[]
  polygon: Point[]
  roomBounds: Bounds2
  thresholds: LintThresholds
  items: LintItem[]
  obstacles: Obstacle[]
  doors: DoorZone[]
  /**
   * What earlier rules reported, so later ones don't repeat it:
   * `E001:<a>:<b>` (both orders), `E002:<placement>:<feature>`,
   * `E003:<placement>:<wall>`, `E004:<placement>:<door>` and `door:<door>`
   * (a door whose swing or doorway is blocked).
   */
  reported: Set<string>
}

/** Thickness of an internal window sill board below the window's bottom. */
export const SILL_THICKNESS_MM = 30

/** Segments used to polygonise a door's quarter-circle swing. */
export const SWING_SEGMENTS = 24

const FEATURE_WORDS: Record<Feature["type"], string> = {
  beam: "beam",
  door: "door",
  window: "window",
  opening: "opening",
  radiator: "radiator",
  obstacle: "obstacle",
  socket: "socket",
  switch: "switch",
  data: "data point",
  aerial: "aerial socket",
  "wall-light": "wall light",
  hearth: "hearth",
  "floor-socket": "floor socket",
  "floor-obstacle": "floor obstacle",
  pendant: "pendant",
  "ceiling-light": "ceiling light",
  spotlight: "spotlight",
  "smoke-alarm": "smoke alarm",
}

/** "door D2 (Kitchen door)", "pier OB1 (Wall pier)", "socket S1". */
export function featureRef(feature: Feature): string {
  const word =
    feature.type === "obstacle"
      ? feature.kind.replace(/-/g, " ")
      : FEATURE_WORDS[feature.type]
  return feature.label
    ? `${word} ${feature.id} (${feature.label})`
    : `${word} ${feature.id}`
}

export function findWallOf(
  walls: readonly Wall[],
  feature: WallFeature
): Wall | undefined {
  return walls.find((wall) => wall.id === feature.wall)
}

function buildItems(
  placements: readonly Placement[],
  assets: Readonly<Record<string, AssetSpec>>
): LintItem[] {
  const present = placements.filter((p) => assets[p.assetId] !== undefined)
  const baseName = (p: Placement) => p.label ?? assets[p.assetId]?.name ?? p.id
  const counts = new Map<string, number>()
  for (const p of present) {
    const name = baseName(p)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return present.map((placement) => {
    const asset = assets[placement.assetId]!
    const base = baseName(placement)
    const name =
      (counts.get(base) ?? 0) > 1 && base !== placement.id
        ? `${base} (${placement.id})`
        : base
    const parts = worldShapes(placement, asset).map((shape) => ({
      ...makeSolid(shape.footprint, shape.y0, shape.y1),
      part: shape.part,
    }))
    const local = assetLocalBounds(asset)
    return {
      id: placement.id,
      placement,
      asset,
      name,
      covering: asset.mount === "floor-covering",
      parts,
      bounds: bounds(parts.flatMap((p) => p.footprint)),
      y0: Math.min(...parts.map((p) => p.y0)),
      y1: Math.max(...parts.map((p) => p.y1)),
      local,
      transform: placementTransform(placement),
      area: (local.max[0] - local.min[0]) * (local.max[2] - local.min[2]),
    }
  })
}

/** Wall spans not covered by doors or openings (where skirting runs). */
function skirtingSpans(
  wall: Wall,
  features: readonly Feature[]
): [number, number][] {
  const gaps = features
    .filter(isWallFeature)
    .filter(
      (f) => f.wall === wall.id && (f.type === "door" || f.type === "opening")
    )
    .map((f): [number, number] => [f.offset, f.offset + f.width])
    .sort((a, b) => a[0] - b[0])
  const spans: [number, number][] = []
  let from = 0
  for (const [start, end] of gaps) {
    if (start > from) spans.push([from, Math.min(start, wall.length)])
    from = Math.max(from, end)
  }
  if (from < wall.length) spans.push([from, wall.length])
  return spans.filter(([a, b]) => b - a > 1)
}

function buildObstacles(room: RoomGeometry, walls: readonly Wall[]) {
  const obstacles: Obstacle[] = []
  for (const feature of room.features) {
    if (isWallFeature(feature)) {
      const wall = findWallOf(walls, feature)
      if (!wall) continue
      const top = feature.bottom + feature.height
      if (feature.type === "radiator" || feature.type === "obstacle") {
        obstacles.push({
          key: feature.id,
          kind: feature.type,
          featureId: feature.id,
          wall,
          name: featureRef(feature),
          solid: makeSolid(
            wallFeatureFootprint(wall, feature, feature.depth),
            feature.bottom,
            top
          ),
        })
      } else if (feature.type === "window" && (feature.sillDepth ?? 0) > 0) {
        obstacles.push({
          key: `${feature.id}-sill`,
          kind: "sill",
          featureId: feature.id,
          wall,
          name: `the sill of window ${feature.id}`,
          solid: makeSolid(
            wallFeatureFootprint(wall, feature, feature.sillDepth ?? 0),
            Math.max(0, feature.bottom - SILL_THICKNESS_MM),
            feature.bottom
          ),
        })
      }
    } else if (feature.type === "hearth" || feature.type === "floor-obstacle") {
      const transform = placementTransform({
        x: feature.x,
        z: feature.z,
        facing: feature.facing ?? DEFAULT_FACING,
        elevation: 0,
      })
      const footprint = localRectToPlan(
        transform,
        -feature.width / 2,
        -feature.depth / 2,
        feature.width / 2,
        feature.depth / 2
      )
      obstacles.push({
        key: feature.id,
        kind: feature.type,
        featureId: feature.id,
        name: featureRef(feature),
        solid: makeSolid(footprint, 0, feature.height),
      })
    }
  }

  const { depth, height } = room.skirting
  if (depth > 0 && height > 0) {
    for (const wall of walls) {
      for (const [from, to] of skirtingSpans(wall, room.features)) {
        obstacles.push({
          key: `skirting-${wall.id}-${Math.round(from)}`,
          kind: "skirting",
          wall,
          name: `the skirting on ${wall.id}`,
          solid: makeSolid(
            wallFeatureFootprint(
              wall,
              { offset: from, width: to - from },
              depth
            ),
            0,
            height
          ),
        })
      }
    }
  }
  return obstacles
}

function buildDoors(
  room: RoomGeometry,
  walls: readonly Wall[],
  doorwayDepth: number
): DoorZone[] {
  const zones: DoorZone[] = []
  for (const feature of room.features) {
    if (feature.type !== "door" && feature.type !== "opening") continue
    const wall = findWallOf(walls, feature)
    if (!wall) continue
    const top = feature.bottom + feature.height
    const doorway = makeSolid(
      wallFeatureFootprint(wall, feature, doorwayDepth),
      feature.bottom,
      top
    )
    const swings: DoorZone["swings"] = []
    if (feature.type === "door" && feature.swing !== "none") {
      const leaves = feature.leaves ?? 1
      const radius = feature.width / leaves
      const side = feature.swing === "in" ? 1 : -1
      const open: Point = [wall.normal[0] * side, wall.normal[1] * side]
      const startJamb = {
        hinge: wallPoint(wall, feature.offset),
        towards: wall.dir,
      }
      const endJamb = {
        hinge: wallPoint(wall, feature.offset + feature.width),
        towards: [-wall.dir[0], -wall.dir[1]] as Point,
      }
      const jambs =
        leaves === 2
          ? [startJamb, endJamb]
          : [feature.hinge === "start" ? startJamb : endJamb]
      for (const jamb of jambs) {
        swings.push({
          hinge: jamb.hinge,
          closed: jamb.towards,
          open,
          radius,
        })
      }
    }
    const swingSolids =
      feature.type === "door" && feature.swing === "in"
        ? swings.map((s) =>
            makeSolid(
              sectorPolygon(
                s.hinge,
                s.closed,
                s.open,
                s.radius,
                SWING_SEGMENTS
              ),
              feature.bottom,
              top
            )
          )
        : []
    zones.push({
      feature,
      wall,
      name: featureRef(feature),
      doorway,
      swings,
      swingSolids,
    })
  }
  return zones
}

export function buildContext(
  room: RoomGeometry,
  placements: readonly Placement[],
  assets: Readonly<Record<string, AssetSpec>>,
  thresholds: LintThresholds
): LintContext {
  const walls = deriveWalls(room.corners)
  const polygon: Point[] = room.corners.map(([x, z]) => [x, z])
  return {
    room,
    walls,
    polygon,
    roomBounds: bounds(polygon),
    thresholds,
    items: buildItems(placements, assets),
    obstacles: buildObstacles(room, walls),
    doors: buildDoors(room, walls, thresholds.doorwayDepthMm),
    reported: new Set(),
  }
}
