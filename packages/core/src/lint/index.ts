import type { RoomGeometry } from "../geometry/room-geometry"
import type { AssetSpec, LintReport, Placement } from "../schema"

// Interface stub: the lint engineer replaces the body. The signature is the
// contract the backend, MCP server and UI build against.

export interface LintInput {
  room: RoomGeometry
  placements: readonly Placement[]
  /** Asset specs keyed by `placement.assetId`. */
  assets: Readonly<Record<string, AssetSpec>>
}

export function lint(input: LintInput): LintReport {
  void input
  return { ok: true, counts: { error: 0, warning: 0, info: 0 }, issues: [] }
}
