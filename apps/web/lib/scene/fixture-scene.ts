import {
  type AssetSpec,
  type Camera,
  defaultCameras,
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_FINISHES,
  LIVING_ROOM_SKIRTING,
  type Placement,
  type RenderPass,
  TEST_ASSETS,
} from "@roomer/core"

import type { CameraView, RenderScene, SceneRoom } from "./types"

// A furnished living room built from core's fixtures, for the render
// fixture script, the photoreal pipeline's tests and anyone who needs a
// realistic scene without a database. Positions are hand-computed (mm):
// the room is 2980 wide (x) and 7690 long (z), kitchen door D1 at the top,
// hall door D2 on the right wall (W2, z 5250–6010), window WIN1 at the
// bottom (W5), pier OB1 on the left wall (W6, z 1770–2770).

export const FIXTURE_ROOM: SceneRoom = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
  finishes: LIVING_ROOM_FINISHES,
}

/** Fixture assets keyed by the asset ids the placements use. */
export const FIXTURE_ASSETS = {
  "test-sofa": TEST_ASSETS.sofa,
  "test-coffee-table": TEST_ASSETS.coffeeTable,
  "test-rug": TEST_ASSETS.rug,
  "test-sideboard": TEST_ASSETS.sideboard,
  "test-tv": TEST_ASSETS.wallTv,
  "test-dining-table": TEST_ASSETS.diningTable,
  "test-dining-chair": TEST_ASSETS.diningChair,
  "test-pendant": TEST_ASSETS.pendantLamp,
} as const satisfies Record<string, AssetSpec>

type FixtureAssetId = keyof typeof FIXTURE_ASSETS

const SKIRTING = LIVING_ROOM_SKIRTING.depth
const LIVING_Z = 3950
const DINING = { x: 1085, z: 6300 } as const
const TABLE_HALF_DEPTH = TEST_ASSETS.diningTable.dims.d / 2
const CHAIR_HALF_DEPTH = TEST_ASSETS.diningChair.dims.d / 2
/** How far chairs tuck under the table top. */
const CHAIR_TUCK = 150

function place(
  id: string,
  assetId: FixtureAssetId,
  x: number,
  z: number,
  facing: number,
  elevation = 0
): Placement {
  return { id, assetId, x, z, facing, elevation }
}

export const FIXTURE_PLACEMENTS: Placement[] = [
  // Living zone, below the pier: sofa with its back to W6, facing the TV.
  place(
    "sofa",
    "test-sofa",
    SKIRTING + TEST_ASSETS.sofa.dims.d / 2,
    LIVING_Z,
    90
  ),
  place("rug", "test-rug", 1500, LIVING_Z, 90),
  place("coffee-table", "test-coffee-table", 1618, LIVING_Z, 90),
  place(
    "sideboard",
    "test-sideboard",
    2980 - SKIRTING - TEST_ASSETS.sideboard.dims.d / 2,
    LIVING_Z,
    270
  ),
  place(
    "tv",
    "test-tv",
    2980 - TEST_ASSETS.wallTv.dims.d / 2,
    LIVING_Z,
    270,
    1050
  ),
  // Dining zone at the window end, chairs tucked under both long sides.
  place("dining-table", "test-dining-table", DINING.x, DINING.z, 180),
  ...[-450, 450].flatMap((dx, i) => [
    place(
      `chair-${i + 1}`,
      "test-dining-chair",
      DINING.x + dx,
      DINING.z - TABLE_HALF_DEPTH - CHAIR_HALF_DEPTH + CHAIR_TUCK,
      180
    ),
    place(
      `chair-${i + 3}`,
      "test-dining-chair",
      DINING.x + dx,
      DINING.z + TABLE_HALF_DEPTH + CHAIR_HALF_DEPTH - CHAIR_TUCK,
      0
    ),
  ]),
  place(
    "pendant",
    "test-pendant",
    DINING.x,
    DINING.z,
    180,
    LIVING_ROOM_CEILING_HEIGHT - TEST_ASSETS.pendantLamp.dims.h
  ),
]

const DEFAULT_CAMERAS = defaultCameras(FIXTURE_ROOM)

function defaultCamera(id: string): Camera {
  const camera = DEFAULT_CAMERAS.find((c) => c.id === id)
  if (!camera) throw new Error(`The fixture room has no default camera ${id}`)
  return camera
}

/** Core's default doorway camera at D1: level, 1.5 m up, fov 70. */
const FROM_DOOR = defaultCamera("from-d1")

export const FIXTURE_CAMERAS: Record<
  "fromDoor" | "fromHall" | "fromWindow" | "fromHallDoor",
  Camera
> = {
  /** Just inside door D1 (from the kitchen), looking down the room. */
  fromDoor: FROM_DOOR,
  /**
   * @deprecated D1 turned out to be the kitchen door, not the hall's; use
   * `fromDoor`. Kept until the photoreal spike script moves over.
   */
  fromHall: FROM_DOOR,
  /** Core's default camera at D2 (from the hall), looking across the room. */
  fromHallDoor: defaultCamera("from-d2"),
  /** From the window end, looking back towards the kitchen door (level). */
  fromWindow: {
    id: "from-window",
    name: "From the window",
    position: [1900, 1500, 7550],
    target: [1200, 1500, 400],
    fov: 70,
  },
}

/** The same camera with a fisheye lens and a different vertical fov. */
export function withFisheye(camera: Camera, fov: number): Camera {
  return { ...camera, id: `${camera.id}-fisheye`, fov, projection: "fisheye" }
}

export interface FixtureSceneOptions {
  view: CameraView
  pass?: RenderPass
  width?: number
  height?: number
  showCeiling?: boolean
}

/** The furnished fixture room as a render request. */
export function buildFixtureScene({
  view,
  pass = "clay",
  width = 1536,
  height = 1024,
  showCeiling,
}: FixtureSceneOptions): RenderScene {
  return {
    room: FIXTURE_ROOM,
    placements: FIXTURE_PLACEMENTS,
    assets: FIXTURE_ASSETS,
    view,
    pass,
    width,
    height,
    ...(showCeiling === undefined ? {} : { showCeiling }),
  }
}
