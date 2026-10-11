import {
  type AssetSpec,
  defaultCameras,
  type Feature,
  isBeamFeature,
  isFloorFeature,
  isWallFeature,
  type Placement,
  worldShapes,
} from "@roomer/core"
import {
  bearingOf,
  bounds,
  type Bounds2,
  deriveWalls,
  placementTransform,
  type Point,
  polygonCentroid,
  type RoomGeometry,
  wallFeatureFootprint,
} from "@roomer/core/geometry"

import { beamFootprint } from "@/lib/scene/room-geometry"

import {
  circleInsidePenetration,
  circleOverlapsPolygon,
  circlePolygonPenetration,
} from "./collide"
import { CONTACT_SLOP, PLAYER } from "./player"

// What the walker can bump into, built from the same shapes the linter
// uses: every placed part (core's worldShapes), the room's fixed obstacles,
// and the room outline itself, which encloses the walker (doorways lead
// nowhere in v1).

export type ColliderKind = "placement" | "feature"

export interface Collider {
  /** Placement id or feature id. */
  id: string
  kind: ColliderKind
  /** What to call it in "bumped into …". */
  label: string
  /** Plan outline (x, z), mm. */
  footprint: Point[]
  /** Bottom and top above the floor, mm. */
  y0: number
  y1: number
  /** Rugs: something to stand on, never something to bump into. */
  walkable: boolean
  /** A 6-footer fits upright on top (top + height ≤ ceiling). */
  standable: boolean
  /** Plan bounds, for quick rejection. */
  box: Bounds2
}

export interface WalkSpawn {
  position: Point
  /** Plan bearing the walker faces, degrees. */
  heading: number
}

export interface WalkWorld {
  /** The room outline the walker stays inside. */
  outline: Point[]
  /** Labels for the outline's edges (edge i is wall W(i+1)). */
  wallLabels: string[]
  ceilingHeight: number
  /** Extra clearance from the plaster: the skirting board's depth, mm. */
  wallInset: number
  colliders: Collider[]
  spawn: WalkSpawn
}

export interface WalkSceneInput {
  room: RoomGeometry
  placements: readonly Placement[]
  assets: Readonly<Record<string, AssetSpec>>
}

function featureLabel(feature: Feature): string {
  // "Bumped into the ceiling beam" reads better than its long label.
  if (feature.type === "beam") return "the ceiling beam"
  if (feature.label) return feature.label
  const name = feature.type.replace("-", " ")
  return `the ${name} ${feature.id}`
}

function collider(
  fields: Omit<Collider, "box" | "standable">,
  ceilingHeight: number
): Collider {
  return {
    ...fields,
    standable: fields.y1 + PLAYER.height <= ceilingHeight,
    box: bounds(fields.footprint),
  }
}

function featureColliders(room: RoomGeometry): Collider[] {
  const walls = deriveWalls(room.corners)
  const out: Collider[] = []
  const add = (feature: Feature, footprint: Point[], y0: number, y1: number) =>
    out.push(
      collider(
        {
          id: feature.id,
          kind: "feature",
          label: featureLabel(feature),
          footprint,
          y0,
          y1,
          walkable: false,
        },
        room.ceilingHeight
      )
    )
  for (const feature of room.features) {
    if (isWallFeature(feature)) {
      const wall = walls.find((w) => w.id === feature.wall)
      if (!wall) continue
      const top = feature.bottom + feature.height
      if (feature.type === "obstacle" || feature.type === "radiator") {
        add(
          feature,
          wallFeatureFootprint(wall, feature, feature.depth),
          feature.bottom,
          top
        )
      } else if (feature.type === "window" && feature.sillDepth) {
        add(
          feature,
          wallFeatureFootprint(wall, feature, feature.sillDepth),
          Math.max(0, feature.bottom - 30),
          feature.bottom
        )
      }
    } else if (isBeamFeature(feature)) {
      // Overhead: only heads (and anyone standing on furniture) meet it.
      add(
        feature,
        beamFootprint(feature),
        Math.max(0, room.ceilingHeight - feature.drop),
        room.ceilingHeight
      )
    } else if (isFloorFeature(feature) && feature.type !== "floor-socket") {
      const t = placementTransform({
        x: feature.x,
        z: feature.z,
        facing: feature.facing ?? 180,
        elevation: 0,
      })
      const w = feature.width / 2
      const d = feature.depth / 2
      add(
        feature,
        [t.toPlan(-w, -d), t.toPlan(w, -d), t.toPlan(w, d), t.toPlan(-w, d)],
        0,
        feature.height
      )
    }
  }
  return out
}

function placementColliders(input: WalkSceneInput): Collider[] {
  const out: Collider[] = []
  for (const placement of input.placements) {
    const asset = input.assets[placement.assetId]
    if (!asset) continue
    const label = placement.label?.trim() || asset.name
    const walkable = asset.mount === "floor-covering"
    for (const shape of worldShapes(placement, asset)) {
      out.push(
        collider(
          {
            id: placement.id,
            kind: "placement",
            label,
            footprint: shape.footprint,
            y0: shape.y0,
            y1: shape.y1,
            walkable,
          },
          input.room.ceilingHeight
        )
      )
    }
  }
  return out
}

/** Does `c` stop a walker whose feet are at `feet` (mm)? */
export function blocks(c: Collider, feet: number): boolean {
  if (c.walkable) return false
  if (c.y0 >= feet + PLAYER.height) return false
  // Low enough to step onto — unless a 6-footer couldn't stand up there.
  return c.y1 > feet + PLAYER.stepUp || !c.standable
}

/** Highest surface under the walker's circle it could step or land on. */
export function groundAt(
  world: WalkWorld,
  position: Point,
  feet: number
): number {
  let ground = 0
  for (const c of world.colliders) {
    if (c.y1 <= ground || c.y1 > feet + PLAYER.stepUp) continue
    // Rugs always; anything else only if a 6-footer fits upright on it.
    if (!c.walkable && !c.standable) continue
    if (!nearBox(c.box, position, PLAYER.radius)) continue
    if (circleOverlapsPolygon(position, PLAYER.radius, c.footprint))
      ground = c.y1
  }
  return ground
}

export function nearBox(box: Bounds2, [x, z]: Point, radius: number): boolean {
  return (
    x + radius > box.minX &&
    x - radius < box.maxX &&
    z + radius > box.minZ &&
    z - radius < box.maxZ
  )
}

/**
 * Can the walker stand at `position` with feet at `feet` (default: on
 * whatever is underfoot)? Overlaps within CONTACT_SLOP don't count.
 */
export function isFree(
  world: WalkWorld,
  position: Point,
  feet = groundAt(world, position, 0)
): boolean {
  const wall = circleInsidePenetration(
    position,
    PLAYER.radius + world.wallInset,
    world.outline
  )
  if (wall && wall.depth > CONTACT_SLOP) return false
  return !world.colliders.some((c) => {
    if (!blocks(c, feet) || !nearBox(c.box, position, PLAYER.radius))
      return false
    const pen = circlePolygonPenetration(position, PLAYER.radius, c.footprint)
    return pen !== null && pen.depth > CONTACT_SLOP
  })
}

/**
 * The nearest free spot to `preferred`, searching rings 50 mm apart out to
 * 4 m (deterministic order). Falls back to `preferred` if nothing is free.
 */
export function nearestFree(world: WalkWorld, preferred: Point): Point {
  if (isFree(world, preferred)) return preferred
  for (let ring = 1; ring <= 80; ring++) {
    const r = ring * 50
    const samples = 8 * ring
    for (let k = 0; k < samples; k++) {
      const a = (2 * Math.PI * k) / samples
      const p: Point = [
        preferred[0] + r * Math.sin(a),
        preferred[1] - r * Math.cos(a),
      ]
      if (isFree(world, p)) return p
    }
  }
  return preferred
}

/**
 * Where the walk starts: the first doorway's default camera (just inside
 * the door, facing into the room), else the room's centre facing down the
 * plan; nudged to the nearest free spot if something stands there.
 */
function spawnFor(
  world: Omit<WalkWorld, "spawn">,
  room: RoomGeometry
): WalkSpawn {
  const door = defaultCameras(room).find((c) => c.id.startsWith("from-"))
  const preferred: Point = door
    ? [door.position[0], door.position[2]]
    : polygonCentroid(world.outline)
  const heading = door
    ? bearingOf([
        door.target[0] - door.position[0],
        door.target[2] - door.position[2],
      ])
    : 180
  return {
    position: nearestFree(
      { ...world, spawn: { position: preferred, heading } },
      preferred
    ),
    heading,
  }
}

export function buildWalkWorld(input: WalkSceneInput): WalkWorld {
  const { room } = input
  const outline: Point[] = room.corners.map(([x, z]) => [x, z])
  const base = {
    outline,
    wallLabels: deriveWalls(room.corners).map((w) => `the wall ${w.id}`),
    ceilingHeight: room.ceilingHeight,
    wallInset: room.skirting.depth,
    colliders: [...featureColliders(room), ...placementColliders(input)],
  }
  return { ...base, spawn: spawnFor(base, room) }
}
