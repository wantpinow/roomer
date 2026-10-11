import {
  type Camera,
  type DoorFeature,
  type OpeningFeature,
  type Point,
  type RoomGeometry,
  type Wall,
  type WindowFeature,
  area,
  bounds,
  deriveWalls,
  isBeamFeature,
  distance,
  normalize,
  pointSegmentDistance,
  rayPolygonHit,
  sub,
  wallPoint,
} from "@roomer/core"

// Plain-English room and camera descriptions for the photoreal prompt. The
// image model only sees pixels, so telling it "the window is straight ahead"
// is what gets the daylight coming from the right place. Pure.

const metres = (mm: number) => `${Number((mm / 1000).toFixed(2))} m`

/** Door/window/opening — the features worth naming in a description. */
type Landmark = DoorFeature | WindowFeature | OpeningFeature

const isLandmark = (
  feature: RoomGeometry["features"][number]
): feature is Landmark =>
  feature.type === "door" ||
  feature.type === "window" ||
  feature.type === "opening"

function featureName(feature: RoomGeometry["features"][number]): string {
  const label = feature.label?.trim()
  return label
    ? `${label.charAt(0).toLowerCase()}${label.slice(1)} (${feature.id})`
    : `${feature.type} ${feature.id}`
}

function landmarkCentre(feature: Landmark, walls: readonly Wall[]) {
  const wall = walls.find((w) => w.id === feature.wall)
  return wall ? wallPoint(wall, feature.offset + feature.width / 2) : undefined
}

export interface RoomDescriptionInput extends RoomGeometry {
  name?: string
}

/**
 * "Living room, about 2.98 m × 7.69 m (roughly rectangular, with a step in
 * the outline), ceiling 2.45 m. Doors: kitchen door (D1), hall door (D2).
 * Window: front window (WIN1), 1.93 m wide. Also: wall pier, radiator.
 * Ceiling beam (BM1): 0.25 m wide, hanging 0.23 m below the ceiling,
 * spanning the room wall to wall."
 */
export function describeRoomForPrompt(room: RoomDescriptionInput): string {
  const outline: Point[] = room.corners.map(([x, z]) => [x, z])
  const box = bounds(outline)
  const width = box.maxX - box.minX
  const depth = box.maxZ - box.minZ
  const fill = width > 0 && depth > 0 ? area(outline) / (width * depth) : 0
  const shape =
    outline.length === 4
      ? "rectangular"
      : fill > 0.85
        ? "roughly rectangular, with a step in the outline"
        : "irregular"
  const name = room.name?.trim() || "Room"
  const sentences = [
    `${name}, about ${metres(width)} × ${metres(depth)} (${shape}), ceiling ${metres(room.ceilingHeight)}.`,
  ]

  const doors = room.features.filter(
    (f) => f.type === "door" || f.type === "opening"
  )
  if (doors.length) {
    sentences.push(
      `Door${doors.length > 1 ? "s" : ""}: ${doors.map(featureName).join(", ")}.`
    )
  }
  const windows = room.features.filter(
    (f): f is WindowFeature => f.type === "window"
  )
  if (windows.length) {
    sentences.push(
      `Window${windows.length > 1 ? "s" : ""}: ${windows
        .map((w) => `${featureName(w)}, ${metres(w.width)} wide`)
        .join("; ")}.`
    )
  }
  const others = room.features
    .filter(
      (f) =>
        f.type === "radiator" || f.type === "obstacle" || f.type === "hearth"
    )
    .map((f) => f.label?.trim().toLowerCase() || f.type)
  if (others.length) sentences.push(`Also: ${others.join(", ")}.`)

  const walls = deriveWalls(room.corners)
  const onWall = (point: Point) =>
    walls.some((w) => pointSegmentDistance(point, w.start, w.end) <= 50)
  for (const beam of room.features.filter(isBeamFeature)) {
    const ends: Point[] = [beam.start, beam.end].map(([x, z]) => [x, z])
    const span = ends.every(onWall) ? ", spanning the room wall to wall" : ""
    sentences.push(
      `${beam.label?.trim() || "Ceiling beam"} (${beam.id}): ${metres(beam.width)} wide, hanging ${metres(beam.drop)} below the ceiling${span}.`
    )
  }
  return sentences.join(" ")
}

/** Within this distance of a door the camera is "just inside" it. */
const NEAR_DOOR_MM = 1000
/** Within this distance of a corner the camera is "in the corner". */
const NEAR_CORNER_MM = 1200
/** Vertical fov from which a lens reads as wide-angle (70 ≈ 16mm full-frame). */
const WIDE_ANGLE_FOV = 60
/** Light sources within this bearing of the view axis are "ahead". */
const AHEAD_DEG = 30

type Side =
  | "straight ahead"
  | "on the left"
  | "on the right"
  | "behind the camera"

function sideOf(view: Point, toward: Point): Side | undefined {
  if (Math.hypot(...view) === 0 || Math.hypot(...toward) === 0) return undefined
  const v = normalize(view)
  const w = normalize(toward)
  const dot = v[0] * w[0] + v[1] * w[1]
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
  if (angle <= AHEAD_DEG) return "straight ahead"
  if (angle >= 180 - AHEAD_DEG) return "behind the camera"
  // Plan x right, z down: a positive cross product is clockwise = right.
  return v[0] * w[1] - v[1] * w[0] > 0 ? "on the right" : "on the left"
}

/**
 * "Eye-level view (1.5 m) from just inside the kitchen door (D1), looking
 * towards the front window (WIN1), level (vertical lines stay vertical);
 * wide-angle lens, 70° vertical field of view. Daylight comes from the front
 * window (WIN1), straight ahead."
 */
export function describeCameraForPrompt(
  camera: Pick<Camera, "position" | "target" | "fov" | "projection">,
  room: RoomGeometry
): string {
  const outline: Point[] = room.corners.map(([x, z]) => [x, z])
  const walls = deriveWalls(room.corners)
  const here: Point = [camera.position[0], camera.position[2]]
  const view = sub([camera.target[0], camera.target[2]], here)
  const landmarks = room.features.filter(isLandmark).flatMap((feature) => {
    const centre = landmarkCentre(feature, walls)
    return centre ? [{ feature, centre }] : []
  })

  const door = landmarks
    .filter(({ feature }) => feature.type !== "window")
    .map((l) => ({ ...l, gap: distance(l.centre, here) }))
    .filter((l) => l.gap <= NEAR_DOOR_MM)
    .sort((a, b) => a.gap - b.gap)[0]
  const corner = outline
    .map((point, index) => ({ index, gap: distance(point, here) }))
    .filter((c) => c.gap <= NEAR_CORNER_MM)
    .sort((a, b) => a.gap - b.gap)[0]
  const from = door
    ? `from just inside the ${featureName(door.feature)}`
    : corner
      ? `from corner C${corner.index + 1}`
      : "from inside the room"

  let looking = ""
  const hit =
    Math.hypot(view[0], view[1]) > 0
      ? rayPolygonHit(outline, here, normalize(view))
      : undefined
  if (hit) {
    const wall = walls.find(
      (w) => pointSegmentDistance(hit.point, w.start, w.end) < 1
    )
    const seen = landmarks
      .filter((l) => l.feature.type === "window" || l !== door)
      .filter((l) => wall && l.feature.wall === wall.id)
      .map((l) => featureName(l.feature))
    looking = seen.length
      ? `, looking towards the ${seen.join(" and the ")}`
      : wall
        ? `, looking towards wall ${wall.id}`
        : ""
  }

  const drop = camera.position[1] - camera.target[1]
  const run = Math.hypot(view[0], view[1])
  const tilt = (Math.atan2(drop, run) * 180) / Math.PI
  const tilted =
    tilt > 12
      ? ", tilted down"
      : tilt > 3
        ? ", tilted slightly down"
        : tilt < -3
          ? ", tilted up"
          : ", level (vertical lines stay vertical)"
  const lens =
    camera.projection === "fisheye"
      ? "fisheye lens (straight lines bow outwards)"
      : camera.fov >= WIDE_ANGLE_FOV
        ? "wide-angle lens"
        : "standard lens"

  const sentences = [
    `Eye-level view (${metres(camera.position[1])}) ${from}${looking}${tilted}; ${lens}, ${Math.round(camera.fov)}° vertical field of view.`,
  ]
  const light = landmarks
    .filter((l) => l.feature.type === "window")
    .map((l) => {
      const side = sideOf(view, sub(l.centre, here))
      return `the ${featureName(l.feature)}${side ? `, ${side}` : ""}`
    })
  if (light.length) sentences.push(`Daylight comes from ${light.join("; ")}.`)
  return sentences.join(" ")
}
