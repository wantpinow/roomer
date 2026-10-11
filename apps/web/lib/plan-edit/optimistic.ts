import type { RoomGeometry } from "@roomer/core/geometry"
import { applyOps, type ResolvedAsset } from "@roomer/core/placement"
import type { AssetSpec, LayoutOp, Placement } from "@roomer/core/schema"

// Local previews of layout edits. The server runs the same core `applyOps`,
// so applying it here gives exactly the placements the mutation will store
// — the UI can show them before the round trip.

/**
 * Placements after `ops`, or null when core refuses them (the server would
 * too; the caller then waits for the real result instead of guessing).
 */
export function previewOps<P extends Placement>(input: {
  room: RoomGeometry
  placements: readonly P[]
  /** Asset specs by asset id. */
  assets: Readonly<Record<string, AssetSpec>>
  ops: readonly LayoutOp[]
}): P[] | null {
  const resolve = (ref: string): ResolvedAsset | undefined => {
    const spec = input.assets[ref]
    return spec ? { id: ref, spec } : undefined
  }
  try {
    const { placements } = applyOps({
      room: input.room,
      placements: input.placements,
      ops: [...input.ops],
      assets: resolve,
    })
    // applyOps returns plain Placements; keep the caller's richer type for
    // placements it didn't add (ids and asset ids are unchanged by moves).
    const byId = new Map(input.placements.map((p) => [p.id, p]))
    return placements.map((p) => {
      const original = byId.get(p.id)
      return (original ? { ...original, ...p } : p) as P
    })
  } catch {
    return null
  }
}

/** Placements with one item's centre replaced (the drag preview). */
export function withPosition<P extends Placement>(
  placements: readonly P[],
  id: string,
  x: number,
  z: number
): P[] {
  return placements.map((p) => (p.id === id ? { ...p, x, z } : p))
}

/** An `add` op that puts a removed placement back exactly where it was. */
export function restoreOp(placement: Placement): LayoutOp {
  return {
    op: "add",
    id: placement.id,
    asset: placement.assetId,
    ...(placement.label !== undefined ? { label: placement.label } : {}),
    ...(placement.mirrored !== undefined
      ? { mirrored: placement.mirrored }
      : {}),
    position: {
      mode: "at",
      x: placement.x,
      z: placement.z,
      facing: placement.facing,
      elevation: placement.elevation,
    },
  }
}

/** The `move` op a finished drag sends. */
export function moveOp(placement: Placement, x: number, z: number): LayoutOp {
  return {
    op: "move",
    id: placement.id,
    position: {
      mode: "at",
      x,
      z,
      facing: placement.facing,
      elevation: placement.elevation,
    },
  }
}
