import type { Id } from "@roomer/backend/convex/_generated/dataModel"

import type {
  AssetDetail,
  LayoutDetail,
  RoomDetail,
  RoomerApi,
} from "../convex"
import { notFound } from "../pipelines/errors"

// Loading what a tool was pointed at, with a not-found message that tells
// the agent where valid ids come from.

/** Convex ids are long lowercase base32 strings; keys are hyphenated slugs. */
export function looksLikeConvexId(value: string): boolean {
  return /^[a-z0-9]{20,40}$/.test(value)
}

function isValidatorError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("ArgumentValidation")
}

/** An asset by key or id. */
export async function resolveAsset(
  api: RoomerApi,
  ref: string
): Promise<AssetDetail> {
  const byKey = await api.assets.getByKey({ key: ref })
  if (byKey) return byKey
  if (looksLikeConvexId(ref)) {
    try {
      const byId = await api.assets.get({ assetId: ref as Id<"assets"> })
      if (byId) return byId
    } catch (error) {
      // An id of another table: not an asset.
      if (!isValidatorError(error)) throw error
    }
  }
  throw notFound(
    `There's no asset with key or id '${ref}'. Find assets with search_assets.`
  )
}

export async function loadRoom(
  api: RoomerApi,
  roomId: Id<"rooms">
): Promise<RoomDetail> {
  const room = await api.rooms.get({ roomId })
  if (!room) {
    throw notFound(
      `There's no room with id ${roomId}. get_overview lists the rooms.`
    )
  }
  return room
}

export async function loadLayout(
  api: RoomerApi,
  layoutId: Id<"layouts">
): Promise<LayoutDetail> {
  const layout = await api.layouts.get({ layoutId })
  if (!layout) {
    throw notFound(
      `There's no layout with id ${layoutId}. get_overview and list_layouts list them.`
    )
  }
  return layout
}
