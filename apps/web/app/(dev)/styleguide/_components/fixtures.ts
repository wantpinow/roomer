import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_NAME,
} from "@roomer/core/fixtures"
import { area, bounds } from "@roomer/core/geometry"
import type { LintIssue, Placement } from "@roomer/core/schema"

import type { ActivityEvent } from "@/components/activity/activity-feed"
import type { RoomStatsValue } from "@/components/common/room-stats"
import type { PlacedItem } from "@/components/items/item-row"
import type { LayoutSummary } from "@/components/layouts/layout-card"
import type { AssetSummary } from "@/components/library/asset-card"
import type { RenderSummary } from "@/components/renders/render-card"
import type { ItemPosition } from "@/lib/format/position"

import { PRODUCTS, type ProductKey } from "./products"
import { sceneArt } from "./scene-art"

// Fixture data for the styleguide: Patrick's living room with Castlery
// furniture, a layout that has a couple of real problems, and its history.
// Times are fixed relative to FIXTURE_NOW so the page renders the same on
// every load.

export const FIXTURE_NOW = Date.UTC(2026, 9, 11, 17, 30)
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const product = (key: ProductKey): AssetSummary => {
  const found = PRODUCTS.find((p) => p.id === key)
  if (!found) throw new Error(`Unknown product ${key}`)
  return found
}

export const LIBRARY: readonly AssetSummary[] = PRODUCTS

interface PlacementSpec {
  id: string
  key: ProductKey
  label?: string
  x: number
  z: number
  facing: number
  elevation?: number
  position?: ItemPosition
}

const PLACEMENTS: PlacementSpec[] = [
  {
    id: "rug",
    key: "cora-wool-rug-caramel-229x274",
    label: "Living rug",
    x: 1490,
    z: 5400,
    facing: 90,
  },
  {
    id: "sofa",
    key: "auburn-chaise-sofa-left-facing-chalk-boucle",
    label: "Chaise sofa",
    x: 848,
    z: 5400,
    facing: 90,
    position: { mode: "against", wall: "W6", along: 2290 },
  },
  {
    id: "coffee-table",
    key: "albie-travertine-round-coffee-table-90",
    x: 2050,
    z: 5300,
    facing: 270,
  },
  {
    id: "armchair",
    key: "avery-swivel-armchair-ginger-boucle",
    x: 2350,
    z: 6550,
    facing: 315,
  },
  {
    id: "floor-lamp",
    key: "faro-sculptural-floor-lamp",
    x: 400,
    z: 3560,
    facing: 90,
  },
  {
    id: "mirror",
    key: "faro-round-wall-mirror",
    x: 43,
    z: 5400,
    facing: 90,
    elevation: 1250,
    position: { mode: "onWall", wall: "W6", along: 2290 },
  },
  {
    id: "dining-table",
    key: "harper-dining-table-220-chestnut-oak",
    x: 1490,
    z: 2000,
    facing: 90,
  },
  {
    id: "chair-1",
    key: "anya-dining-chair-chestnut",
    label: "Anya chair 1",
    x: 665,
    z: 1500,
    facing: 90,
  },
  {
    id: "chair-2",
    key: "anya-dining-chair-chestnut",
    label: "Anya chair 2",
    x: 665,
    z: 2500,
    facing: 90,
  },
  {
    id: "chair-3",
    key: "anya-dining-chair-chestnut",
    label: "Anya chair 3",
    x: 2315,
    z: 1500,
    facing: 270,
  },
  {
    id: "chair-4",
    key: "anya-dining-chair-chestnut",
    label: "Anya chair 4",
    x: 2315,
    z: 2500,
    facing: 270,
  },
  {
    id: "sideboard",
    key: "harper-curved-sideboard-chestnut",
    x: 2712,
    z: 3900,
    facing: 270,
    position: { mode: "against", wall: "W2", along: 3900 },
  },
  {
    id: "pendant-dining",
    key: "blair-large-pendant",
    label: "Pendant over table",
    x: 1490,
    z: 2400,
    facing: 180,
    elevation: 157,
  },
  {
    id: "pendant-living",
    key: "blair-large-pendant",
    label: "Pendant, living end",
    x: 1490,
    z: 5600,
    facing: 180,
    elevation: 157,
  },
]

export const ITEMS: PlacedItem[] = PLACEMENTS.map((spec) => {
  const asset = product(spec.key)
  const placement: Placement = {
    id: spec.id,
    assetId: asset.id,
    label: spec.label,
    x: spec.x,
    z: spec.z,
    facing: spec.facing,
    elevation: spec.elevation ?? 0,
  }
  return {
    placement,
    asset: {
      name: asset.name,
      category: asset.category,
      dims: asset.dims,
      price: asset.product?.price,
      currency: asset.product?.currency,
      imageUrl: asset.imageUrl,
    },
    position: spec.position,
  }
})

/** Display names by placement and feature id, for issue chips. */
export const LABELS: Record<string, string> = {
  ...Object.fromEntries(
    ITEMS.map((item) => [
      item.placement.id,
      item.placement.label ??
        item.asset.name.replace(
          / Performance.*| Travertine.*| Sculptural.*/,
          ""
        ),
    ])
  ),
  D1: "Kitchen door",
  D2: "Hall door",
  S1: "Socket S1",
  WIN1: "Front window",
}

export const ISSUES: LintIssue[] = [
  {
    code: "E001",
    severity: "error",
    message:
      "Chaise sofa overlaps Albie coffee table by 120 mm (x) × 690 mm (z).",
    hint: "Move Albie coffee table 125 mm towards W2.",
    placementIds: ["sofa", "coffee-table"],
    featureIds: [],
    at: [1618, 5300],
  },
  {
    code: "E004",
    severity: "error",
    message: "Albie coffee table is inside the Hall door's swing by 270 mm.",
    hint: "Move it 275 mm towards the kitchen end, or rehang D2 to swing out.",
    placementIds: ["coffee-table"],
    featureIds: ["D2"],
  },
  {
    code: "W101",
    severity: "warning",
    message:
      "The narrowest route from the Kitchen door to the Hall door is 640 mm, between Harper dining table and Harper sideboard.",
    hint: "Free another 60 mm — e.g. move Harper dining table 60 mm towards W6.",
    placementIds: ["dining-table", "sideboard"],
    featureIds: ["D1", "D2"],
  },
  {
    code: "W102",
    severity: "warning",
    message:
      "Avery armchair's legroom (350 mm in front) is blocked by Albie coffee table.",
    hint: "Turn the armchair 30° towards the window, or move the table.",
    placementIds: ["armchair", "coffee-table"],
    featureIds: [],
  },
  {
    code: "I201",
    severity: "info",
    message: "Socket S1 is hidden behind the Chaise sofa.",
    hint: "Fine if you rarely need it; a lamp could plug in behind the sofa.",
    placementIds: ["sofa"],
    featureIds: ["S1"],
  },
  {
    code: "I203",
    severity: "info",
    message:
      "A 140 mm gap between Faro floor lamp and W6 — it tends to collect dust and look accidental.",
    hint: "Push it back to the wall, or leave at least 300 mm.",
    placementIds: ["floor-lamp"],
    featureIds: [],
  },
]

export const LINT_COUNTS = { error: 2, warning: 2, info: 2 }

export const LAYOUTS: LayoutSummary[] = [
  {
    id: "chaise-by-the-pier",
    name: "Chaise by the pier",
    status: "candidate",
    lintCounts: LINT_COUNTS,
    revision: 14,
    updatedAt: FIXTURE_NOW - 1 * MIN,
    live: true,
  },
  {
    id: "sofa-facing-window",
    name: "Sofa facing the window",
    status: "favourite",
    lintCounts: { error: 0, warning: 0, info: 1 },
    revision: 9,
    updatedAt: FIXTURE_NOW - 2 * HOUR,
  },
  {
    id: "dining-by-kitchen",
    name: "Dining by the kitchen door",
    status: "draft",
    lintCounts: { error: 1, warning: 1, info: 0 },
    revision: 3,
    updatedAt: FIXTURE_NOW - 26 * HOUR,
  },
  {
    id: "two-armchairs",
    name: "Two armchairs, no sofa",
    status: "draft",
    lintCounts: { error: 0, warning: 1, info: 2 },
    revision: 6,
    updatedAt: FIXTURE_NOW - 3 * DAY,
  },
  {
    id: "first-pass",
    name: "First pass",
    status: "archived",
    lintCounts: { error: 4, warning: 2, info: 1 },
    revision: 2,
    updatedAt: FIXTURE_NOW - 12 * DAY,
  },
]

export const EVENTS: ActivityEvent[] = [
  {
    id: "e14",
    actor: "agent",
    summary: "Moved Albie coffee table 120 mm towards the window",
    revision: 14,
    createdAt: FIXTURE_NOW - 1 * MIN,
    lintBefore: { error: 3, warning: 2, info: 2 },
    lintAfter: LINT_COUNTS,
  },
  {
    id: "e13",
    actor: "agent",
    summary: "Added four Anya dining chairs around the Harper dining table",
    revision: 13,
    createdAt: FIXTURE_NOW - 4 * MIN,
    lintBefore: { error: 1, warning: 1, info: 2 },
    lintAfter: { error: 3, warning: 2, info: 2 },
  },
  {
    id: "e12",
    actor: "user",
    summary: "Marked this layout as a candidate",
    revision: 12,
    createdAt: FIXTURE_NOW - 18 * MIN,
    lintBefore: { error: 1, warning: 1, info: 2 },
    lintAfter: { error: 1, warning: 1, info: 2 },
  },
  {
    id: "e11",
    actor: "agent",
    summary:
      "Swapped the Owen 3-seater for the Auburn chaise sofa (left facing)",
    revision: 11,
    createdAt: FIXTURE_NOW - 25 * MIN,
    lintBefore: { error: 0, warning: 1, info: 1 },
    lintAfter: { error: 1, warning: 1, info: 2 },
  },
  {
    id: "e10",
    actor: "system",
    summary: "Re-checked after the hall door was moved 50 mm along W2",
    revision: 10,
    createdAt: FIXTURE_NOW - 2 * HOUR,
    lintBefore: { error: 0, warning: 2, info: 1 },
    lintAfter: { error: 0, warning: 1, info: 1 },
  },
  {
    id: "e1",
    actor: "agent",
    summary: "Created this layout from “Sofa facing the window”",
    revision: 1,
    createdAt: FIXTURE_NOW - 26 * HOUR,
  },
]

const CLAY = sceneArt("clay")
const ID = sceneArt("id")

export const RENDERS: RenderSummary[] = [
  {
    id: "r4",
    status: "pending",
    model: "openai/gpt-image-2.5-sunburst",
    clayUrl: CLAY,
    idUrl: ID,
    cameraName: "Window corner",
    createdAt: FIXTURE_NOW - 0.3 * MIN,
    layoutRevision: 14,
  },
  {
    id: "r3",
    status: "done",
    model: "openai/gpt-image-2.5-sunburst",
    imageUrl: product("auburn-chaise-sofa-left-facing-chalk-boucle")
      .referenceImages?.[2],
    clayUrl: CLAY,
    idUrl: ID,
    cameraName: "From the hall door",
    createdAt: FIXTURE_NOW - 20 * MIN,
    durationMs: 52_400,
    layoutRevision: 12,
  },
  {
    id: "r2",
    status: "failed",
    model: "google/gemini-3-pro-image",
    clayUrl: CLAY,
    cameraName: "From the kitchen door",
    createdAt: FIXTURE_NOW - 50 * MIN,
    error:
      "The image model timed out after 90 s. Nothing was charged — try again, or use gpt-image-2.5-flare.",
    layoutRevision: 11,
  },
  {
    id: "r1",
    status: "done",
    model: "openai/gpt-image-2.5-flare",
    imageUrl: product("harper-dining-table-220-chestnut-oak")
      .referenceImages?.[2],
    clayUrl: CLAY,
    idUrl: ID,
    cameraName: "Dining end",
    createdAt: FIXTURE_NOW - 2 * HOUR,
    durationMs: 18_100,
    layoutRevision: 9,
  },
]

const extent = bounds(LIVING_ROOM_CORNERS)

export const ROOM = {
  name: LIVING_ROOM_NAME,
  corners: LIVING_ROOM_CORNERS,
  stats: {
    widthMm: extent.maxX - extent.minX,
    depthMm: extent.maxZ - extent.minZ,
    areaMm2: area(LIVING_ROOM_CORNERS),
    ceilingHeightMm: LIVING_ROOM_CEILING_HEIGHT,
    wallCount: LIVING_ROOM_CORNERS.length,
  },
} satisfies { name: string; corners: unknown; stats: RoomStatsValue }
