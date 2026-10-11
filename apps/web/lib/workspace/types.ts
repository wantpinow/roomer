import type { api } from "@roomer/backend/convex/_generated/api"
import type { FunctionReturnType } from "convex/server"

// Query results as the UI receives them, derived from the Convex functions
// (never restated).

export type RoomRow = FunctionReturnType<typeof api.rooms.list>[number]
export type RoomDetail = NonNullable<FunctionReturnType<typeof api.rooms.get>>
export type LayoutRow = FunctionReturnType<
  typeof api.layouts.listByRoom
>[number]
export type LayoutDetail = NonNullable<
  FunctionReturnType<typeof api.layouts.get>
>
export type LayoutEventRow = FunctionReturnType<
  typeof api.layouts.events
>[number]
export type RoomActivity = FunctionReturnType<typeof api.layouts.activity>
export type RenderRow = FunctionReturnType<
  typeof api.renders.listByLayout
>[number]
export type AssetRow = FunctionReturnType<typeof api.assets.list>[number]
export type AssetDetailRow = NonNullable<
  FunctionReturnType<typeof api.assets.get>
>
