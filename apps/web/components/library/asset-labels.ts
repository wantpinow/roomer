import type { AssetCategory, Mount } from "@roomer/core/schema"

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  sofa: "Sofa",
  chair: "Chair",
  table: "Table",
  storage: "Storage",
  bed: "Bed",
  lighting: "Lighting",
  rug: "Rug",
  decor: "Decor",
  media: "Media",
  other: "Other",
}

export const MOUNT_LABELS: Record<Mount, string> = {
  floor: "Stands on the floor",
  "floor-covering": "Floor covering",
  wall: "Wall-mounted",
  ceiling: "Hangs from the ceiling",
}

export const DIMS_SOURCE_LABELS = {
  listing: "from the listing",
  measured: "measured",
  estimated: "estimated",
} as const
