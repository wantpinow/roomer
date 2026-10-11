import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import { bounds, area } from "@roomer/core/geometry"
import type { PlacementRelation } from "@roomer/core/placement"
import type {
  AssetSpec,
  Feature,
  LayoutStatus,
  Placement,
  Vec2,
} from "@roomer/core/schema"

import type { ActivityEvent } from "@/components/activity/activity-feed"
import type { RoomStatsValue } from "@/components/common/room-stats"
import type { PlacedItem } from "@/components/items/item-row"
import type { LayoutSummary } from "@/components/layouts/layout-card"
import type { AssetSummary } from "@/components/library/asset-card"
import type { RenderSummary } from "@/components/renders/render-card"
import type { ItemPosition } from "@/lib/format/position"

import type {
  AssetRow,
  LayoutDetail,
  LayoutEventRow,
  LayoutRow,
  RenderRow,
  RoomActivity,
} from "./types"

// Pure mappings from what the Convex queries return to what the
// presentational components take. Inputs are narrowed to the fields used so
// they're easy to test and don't care about extra fields.

/** How recent an agent change must be for a layout's "live" dot. */
export const LIVE_WINDOW_MS = 90_000

/** A room's headline figures from its solved outline. */
export function roomStats(room: {
  shell: { corners: readonly Vec2[] }
  ceilingHeight: number
}): RoomStatsValue {
  const corners = room.shell.corners
  const box = bounds(corners)
  return {
    widthMm: Math.round(box.maxX - box.minX),
    depthMm: Math.round(box.maxZ - box.minZ),
    areaMm2: area(corners),
    ceilingHeightMm: room.ceilingHeight,
    wallCount: corners.length,
  }
}

/** Layouts whose latest change was the agent's, within `LIVE_WINDOW_MS`. */
export function liveLayoutIds(
  activity: Pick<RoomActivity, "layouts"> | undefined,
  now: number
): Set<string> {
  const live = new Set<string>()
  for (const entry of activity?.layouts ?? []) {
    const latest = entry.latest
    if (
      latest &&
      latest.actor === "agent" &&
      now - latest.createdAt < LIVE_WINDOW_MS
    ) {
      live.add(entry.layoutId)
    }
  }
  return live
}

export function toLayoutSummary(
  row: Pick<
    LayoutRow,
    "_id" | "name" | "status" | "lintCounts" | "revision" | "updatedAt"
  >,
  live = false
): LayoutSummary {
  return {
    id: row._id,
    name: row.name,
    status: row.status,
    lintCounts: row.lintCounts,
    revision: row.revision,
    updatedAt: row.updatedAt,
    live,
  }
}

const STATUS_RANK: Record<LayoutStatus, number> = {
  favourite: 0,
  candidate: 1,
  draft: 2,
  archived: 3,
}

/**
 * The layout to open when none is chosen: the best status (favourite →
 * candidate → draft → archived), most recently changed first.
 */
export function defaultLayout<
  T extends { status: LayoutStatus; updatedAt: number },
>(layouts: readonly T[]): T | undefined {
  return [...layouts].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.updatedAt - a.updatedAt
  )[0]
}

type DetailAsset = LayoutDetail["assets"][string]

/** The AssetSpec fields of a stored asset, without ids, photos or URLs. */
export function assetSpecOf(asset: AssetSpec): AssetSpec {
  const {
    name,
    category,
    mount,
    dims,
    geometry,
    clearance,
    description,
    product,
    tags,
  } = asset
  return {
    name,
    category,
    mount,
    dims,
    geometry,
    ...(clearance !== undefined ? { clearance } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(product !== undefined ? { product } : {}),
    ...(tags !== undefined ? { tags } : {}),
  }
}

/** Asset specs keyed by id, without the storage/UI extras (for core & 3D). */
export function assetSpecs(
  assets: Readonly<Record<string, DetailAsset>>
): Record<string, AssetSpec> {
  return Object.fromEntries(
    Object.entries(assets).map(([id, asset]) => [id, assetSpecOf(asset)])
  )
}

/** A library row as the asset card shows it. */
export function toAssetSummary(
  asset: Pick<
    AssetRow,
    | "_id"
    | "key"
    | "name"
    | "category"
    | "mount"
    | "dims"
    | "product"
    | "description"
    | "primaryImageUrl"
    | "previewUrls"
  >
): AssetSummary {
  const iso = asset.previewUrls.find((p) => p.view === "iso")?.url
  return {
    id: asset._id,
    key: asset.key,
    name: asset.name,
    category: asset.category,
    mount: asset.mount,
    dims: asset.dims,
    product: asset.product,
    description: asset.description,
    imageUrl: asset.primaryImageUrl ?? iso ?? undefined,
  }
}

/** The wall-relative readout for an item, from the backend's relation. */
export function itemPosition(
  relation: PlacementRelation | undefined,
  mount: AssetSpec["mount"] | undefined
): ItemPosition | undefined {
  if (!relation) return undefined
  const wall = relation.nearestWall
  if (!relation.touchingWalls.includes(wall.wall)) return undefined
  return {
    mode: mount === "wall" ? "onWall" : "against",
    wall: wall.wall,
    along: wall.along,
  }
}

export function placedItems(
  layout: Pick<LayoutDetail, "placements" | "assets" | "relations">
): PlacedItem[] {
  return layout.placements.flatMap((placement) => {
    const asset = layout.assets[placement.assetId]
    if (!asset) return []
    return [
      {
        placement,
        asset: {
          name: asset.name,
          category: asset.category,
          dims: asset.dims,
          price: asset.product?.price,
          currency: asset.product?.currency,
          imageUrl: asset.primaryImageUrl ?? undefined,
        },
        position: itemPosition(layout.relations[placement.id], asset.mount),
      },
    ]
  })
}

/**
 * Display names for every id an issue can mention: placements by label or
 * asset name, features by label (falling back to the id).
 */
export function entityLabels(
  layout:
    | {
        placements: readonly Pick<Placement, "id" | "assetId" | "label">[]
        assets: Readonly<Record<string, { name: string } | undefined>>
      }
    | undefined,
  features: readonly Pick<Feature, "id" | "label">[]
): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const feature of features) {
    if (feature.label) labels[feature.id] = feature.label
  }
  for (const placement of layout?.placements ?? []) {
    labels[placement.id] =
      placement.label ?? layout?.assets[placement.assetId]?.name ?? placement.id
  }
  return labels
}

/**
 * Feed events (newest first, as `layouts.events` returns them). Each
 * event's "before" lint counts are the previous (older) event's "after".
 */
export function activityEvents(
  events: readonly Pick<
    LayoutEventRow,
    "_id" | "actor" | "summary" | "revision" | "createdAt" | "lintCounts"
  >[]
): ActivityEvent[] {
  return events.map((event, index) => {
    const older = events[index + 1]
    return {
      id: event._id,
      actor: event.actor,
      summary: event.summary,
      revision: event.revision,
      createdAt: event.createdAt,
      lintAfter: event.lintCounts,
      ...(older ? { lintBefore: older.lintCounts } : {}),
    }
  })
}

/** The time of the agent's latest change in the room, or null. */
export function latestAgentAt(
  activity: Pick<RoomActivity, "latestAgentAt"> | undefined
): number | null {
  return activity?.latestAgentAt ?? null
}

export function toRenderSummary(
  render: Pick<
    RenderRow,
    | "_id"
    | "kind"
    | "status"
    | "view"
    | "model"
    | "outputUrl"
    | "inputUrls"
    | "createdAt"
    | "durationMs"
    | "error"
    | "layoutRevision"
  >
): RenderSummary {
  const input = (role: "clay" | "id") =>
    render.inputUrls.find((i) => i.role === role)?.url ?? undefined
  const output = render.outputUrl ?? undefined
  return {
    id: render._id,
    kind: render.kind,
    status: render.status,
    model: render.model,
    imageUrl: output,
    clayUrl: render.kind === "clay" ? output : input("clay"),
    idUrl: render.kind === "id" ? output : input("id"),
    cameraName: render.view.name,
    createdAt: render.createdAt,
    durationMs: render.durationMs,
    error: render.error,
    layoutRevision: render.layoutRevision,
  }
}

/** Narrow a route param to a Convex id type (the server validates it). */
export function asId<T extends "rooms" | "layouts" | "assets">(
  value: string
): Id<T> {
  return value as Id<T>
}
