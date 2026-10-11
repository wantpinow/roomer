import type { RoomGeometry } from "../geometry/room-geometry"
import type { AssetSpec, LintReport, Placement } from "../schema"

// Interface stub: the plan engineer replaces the body. The signature is the
// contract the MCP server and UI build against.

export interface PlanSvgOptions {
  /** Output width in px; height follows the room's aspect ratio. */
  width?: number
  title?: string
  showDimensions?: boolean
  showLabels?: boolean
  /** Placement ids to emphasise (e.g. the current selection). */
  highlight?: readonly string[]
}

export interface PlanSvgInput {
  room: RoomGeometry
  placements?: readonly Placement[]
  /** Asset specs keyed by `placement.assetId`. */
  assets?: Readonly<Record<string, AssetSpec>>
  lint?: LintReport
  options?: PlanSvgOptions
}

export function planSvg(input: PlanSvgInput): string {
  void input
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>'
}
