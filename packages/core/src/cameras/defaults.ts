import type { Point } from "../geometry/angles"
import { polygonCentroid, rayPolygonHit } from "../geometry/distance"
import type { RoomGeometry } from "../geometry/room-geometry"
import { add, normalize, scale, sub } from "../geometry/vec"
import { cornerAngles, deriveWalls, wallPoint } from "../geometry/walls"
import { slugify, uniqueId } from "../placement/ids"
import {
  DEFAULT_CAMERA_FOV,
  DEFAULT_EYE_HEIGHT,
  type Camera,
  type DoorFeature,
  type OpeningFeature,
} from "../schema"

// The viewpoints every room starts with (spec §8 "Cameras"): one standing
// just inside each doorway looking down the room, and one tucked into each
// convex corner looking at the middle — the photos you'd take on a viewing.

/** How far into the room a doorway camera stands. */
export const DOOR_CAMERA_INSET_MM = 300
/** How far from a corner (along its bisector) a corner camera stands. */
export const CORNER_CAMERA_INSET_MM = 400
/** Keep cameras at least this far below the ceiling. */
const CEILING_CLEARANCE_MM = 100

const MAX_NAME_LENGTH = 80

type Entrance = DoorFeature | OpeningFeature

const isEntrance = (
  feature: RoomGeometry["features"][number]
): feature is Entrance => feature.type === "door" || feature.type === "opening"

/** "Hall door" → "hall door"; "TV room door" keeps its capitals. */
function lowerFirst(text: string): string {
  return /[A-Z]/.test(text.charAt(1))
    ? text
    : text.charAt(0).toLowerCase() + text.slice(1)
}

function entranceName(feature: Entrance): string {
  const name = feature.label
    ? `From the ${lowerFirst(feature.label)}`
    : `From ${feature.type === "door" ? "door" : "opening"} ${feature.id}`
  return name.slice(0, MAX_NAME_LENGTH)
}

const vec3 = (plan: Point, y: number): [number, number, number] => [
  Math.round(plan[0]) || 0,
  Math.round(y),
  Math.round(plan[1]) || 0,
]

export function defaultCameras(
  room: Pick<RoomGeometry, "corners" | "features" | "ceilingHeight">
): Camera[] {
  const outline: Point[] = room.corners.map(([x, z]) => [x, z])
  const walls = deriveWalls(room.corners)
  const centroid = polygonCentroid(outline)
  const ceilingLimit = room.ceilingHeight - CEILING_CLEARANCE_MM
  const eye = Math.min(DEFAULT_EYE_HEIGHT, ceilingLimit)
  // Look level, like an estate-agent photo: a level camera keeps vertical
  // edges vertical (two-point perspective).
  const lookAt = eye
  const taken = new Set<string>()
  const cameras: Camera[] = []

  const push = (base: string, camera: Omit<Camera, "id">) => {
    const id = uniqueId(base, taken)
    taken.add(id)
    cameras.push({ id, ...camera })
  }

  for (const feature of room.features.filter(isEntrance)) {
    const wall = walls.find((w) => w.id === feature.wall)
    if (!wall) continue
    const position = wallPoint(
      wall,
      feature.offset + feature.width / 2,
      DOOR_CAMERA_INSET_MM
    )
    // Look straight into the room, at the first wall in the line of sight.
    const target =
      rayPolygonHit(outline, position, wall.normal)?.point ?? centroid
    push(`from-${slugify(feature.id)}`, {
      name: entranceName(feature),
      position: vec3(position, eye),
      target: vec3(target, lookAt),
      fov: DEFAULT_CAMERA_FOV,
    })
  }

  const angles = cornerAngles(room.corners)
  outline.forEach((here, i) => {
    if (angles[i]! >= 180 - 1e-6) return // inside corners face into the room
    const n = outline.length
    const prev = outline[(i + n - 1) % n]!
    const next = outline[(i + 1) % n]!
    const bisector = normalize(
      add(normalize(sub(prev, here)), normalize(sub(next, here)))
    )
    push(`corner-c${i + 1}`, {
      name: `From corner C${i + 1}`,
      position: vec3(add(here, scale(bisector, CORNER_CAMERA_INSET_MM)), eye),
      target: vec3(centroid, lookAt),
      fov: DEFAULT_CAMERA_FOV,
    })
  })

  return cameras
}
