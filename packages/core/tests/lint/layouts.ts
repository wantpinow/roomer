import {
  COFFEE_TABLE,
  DINING_CHAIR,
  DINING_TABLE,
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_SKIRTING,
  PENDANT_LAMP,
  RUG,
  SIDEBOARD,
  SOFA,
  WALL_TV,
} from "../../src/fixtures"
import type { RoomGeometry } from "../../src/geometry"
import { applyOps, type AssetResolver } from "../../src/placement"
import type { AssetSpec, LayoutOp, Placement } from "../../src/schema"

// A realistic furnished living room shared by the lint and plan tests and
// the plan preview script: dining at the kitchen end (table, four chairs,
// pendant over it), the lounge below the pier (sofa on W6, coffee table on
// a rug, TV on W2 facing it) and a sideboard on W6 towards the window, with
// the route from the kitchen door (D1) to the hall door (D2) kept clear.

export const ROOM: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
}

/** Asset specs keyed by asset id, as `lint` and `planSvg` take them. */
export const ASSETS: Record<string, AssetSpec> = {
  "a-sofa": SOFA,
  "a-coffee-table": COFFEE_TABLE,
  "a-rug": RUG,
  "a-tv": WALL_TV,
  "a-dining-table": DINING_TABLE,
  "a-chair": DINING_CHAIR,
  "a-sideboard": SIDEBOARD,
  "a-pendant": PENDANT_LAMP,
}

export const resolveAsset: AssetResolver = (ref) => {
  const spec = ASSETS[ref]
  return spec ? { id: ref, spec } : undefined
}

export const REALISTIC_OPS: LayoutOp[] = [
  // Dining at the kitchen end, under the D1 → D2 route's left side.
  {
    op: "add",
    id: "dining-table",
    asset: "a-dining-table",
    label: "Dining table",
    position: { mode: "at", x: 1100, z: 1900, facing: 180 },
  },
  {
    op: "add",
    id: "chair-1",
    asset: "a-chair",
    position: { mode: "at", x: 650, z: 1310, facing: 180 },
  },
  {
    op: "add",
    id: "chair-2",
    asset: "a-chair",
    position: { mode: "at", x: 1550, z: 1310, facing: 180 },
  },
  {
    op: "add",
    id: "chair-3",
    asset: "a-chair",
    position: { mode: "at", x: 650, z: 2490, facing: 0 },
  },
  {
    op: "add",
    id: "chair-4",
    asset: "a-chair",
    position: { mode: "at", x: 1550, z: 2490, facing: 0 },
  },
  {
    op: "add",
    id: "pendant",
    asset: "a-pendant",
    label: "Pendant",
    position: { mode: "centerOn", placement: "dining-table" },
  },
  // Lounge towards the window end: sofa on W6 facing the TV on W2.
  {
    op: "add",
    id: "sofa",
    asset: "a-sofa",
    label: "Sofa",
    position: { mode: "against", wall: "W6", at: 3470 },
  },
  {
    op: "add",
    id: "coffee-table",
    asset: "a-coffee-table",
    label: "Coffee table",
    position: { mode: "at", x: 1688, z: 4220, facing: 90 },
  },
  {
    op: "add",
    id: "rug",
    asset: "a-rug",
    label: "Rug",
    position: { mode: "centerOn", placement: "coffee-table", dx: -400 },
  },
  {
    op: "add",
    id: "tv",
    asset: "a-tv",
    label: "TV",
    position: { mode: "onWall", wall: "W2", at: 4220, elevation: 1000 },
  },
  {
    op: "add",
    id: "sideboard",
    asset: "a-sideboard",
    label: "Sideboard",
    position: { mode: "against", wall: "W6", at: 1260 },
  },
]

export function placeAll(
  ops: readonly LayoutOp[],
  placements: readonly Placement[] = []
): Placement[] {
  return applyOps({ room: ROOM, placements, ops, assets: resolveAsset })
    .placements
}

/** The realistic layout, resolved. */
export const REALISTIC_LAYOUT: Placement[] = placeAll(REALISTIC_OPS)
