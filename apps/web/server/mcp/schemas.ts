import type {
  Id,
  TableNames,
} from "@roomer/backend/convex/_generated/dataModel"
import { z } from "zod"

// Input pieces shared by several tools. Domain shapes come from
// @roomer/core's schemas; only the MCP-specific arguments live here.

/**
 * A Convex document id. The value is opaque to the server (Convex checks
 * it), so this only brands the string with its table.
 */
export function zConvexId<Table extends TableNames>(
  table: Table,
  description: string
) {
  return z
    .string()
    .trim()
    .min(1)
    .describe(description)
    .transform((value) => value as Id<Table>)
}

export const zRoomId = zConvexId("rooms", "Room id (from get_overview)")
export const zLayoutId = zConvexId(
  "layouts",
  "Layout id (from get_overview or list_layouts)"
)

export const zAssetRef = z
  .string()
  .trim()
  .min(1)
  .describe("Asset key (e.g. generic-sofa) or asset id")

export const zIncludePlan = z
  .boolean()
  .optional()
  .describe("Also return the floor plan as a PNG")

export const zImageUrls = z
  .array(z.url())
  .min(1)
  .max(3)
  .describe(
    "Direct image URLs (the photo file itself, not the product page); white-background front or 3/4 shots work best"
  )
