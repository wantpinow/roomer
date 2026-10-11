import { assetLocalBounds } from "../assets/bounds"
import { formatDegrees, formatMm, formatNumber } from "../geometry/format"
import type { RoomGeometry } from "../geometry/room-geometry"
import { deriveWalls } from "../geometry/walls"
import type {
  AddOp,
  AssetSpec,
  LayoutOp,
  MoveOp,
  NudgeOp,
  Placement,
  PlacementPosition,
  SetOp,
  SwapOp,
} from "../schema"
import type { PlacementContext, Pose } from "./context"
import { listIds, OpError, PlacementError, type OpErrorCode } from "./errors"
import { slugify, uniqueId } from "./ids"
import { ceilingElevation, resolvePosition, roundFacing } from "./resolve"

// Applies a batch of layout ops (`apply_changes`) in order. Pure: it returns
// the new placements plus one human-readable change per op for the activity
// feed, or throws an OpError (nothing applied) pointing at the failing op.

export interface ResolvedAsset {
  id: string
  spec: AssetSpec
  key?: string
}

/** Looks an asset up by id or key. */
export type AssetResolver = (ref: string) => ResolvedAsset | undefined

export interface Change {
  index: number
  op: LayoutOp["op"]
  /** The placement the op acted on. */
  id: string
  /** Short sentence for the activity feed, e.g. "Moved sofa 150mm right". */
  summary: string
}

export interface ApplyOpsInput {
  room: RoomGeometry
  placements: readonly Placement[]
  ops: readonly LayoutOp[]
  assets: AssetResolver
}

export interface ApplyOpsResult {
  placements: Placement[]
  changes: Change[]
}

/** Build a placement with a canonical key order and no empty optionals. */
function makePlacement(
  base: Pose & Pick<Placement, "id" | "assetId">,
  label: string | undefined,
  mirrored: boolean | undefined
): Placement {
  const placement: Placement = {
    id: base.id,
    assetId: base.assetId,
    x: base.x,
    z: base.z,
    facing: base.facing,
    elevation: base.elevation,
  }
  if (label) placement.label = label
  if (mirrored) placement.mirrored = true
  return placement
}

const n = (value: number): string => formatNumber(value)

/** "against W2 at 3,200mm", "centred on coffee-table", … */
export function describePosition(position: PlacementPosition): string {
  switch (position.mode) {
    case "at":
      return `at (${n(position.x)}, ${n(position.z)})`
    case "against": {
      const side =
        position.side && position.side !== "back"
          ? `with its ${position.side} side `
          : ""
      const anchor =
        position.anchor && position.anchor !== "center"
          ? ` (${position.anchor})`
          : ""
      return `${side}against ${position.wall} at ${formatMm(position.at)}${anchor}`
    }
    case "onWall":
      return `on ${position.wall} at ${formatMm(position.at)}, ${formatMm(position.elevation)} up`
    case "centerOn": {
      const target = position.placement ?? position.feature ?? "?"
      const dx = position.dx ?? 0
      const dz = position.dz ?? 0
      const offset =
        dx !== 0 || dz !== 0 ? ` offset by (${n(dx)}, ${n(dz)})` : ""
      return `centred on ${target}${offset}`
    }
    case "inCorner":
      return `in corner ${position.corner}`
  }
}

function nudgeSummary(id: string, op: NudgeOp): string {
  const dx = op.dx ?? 0
  const dz = op.dz ?? 0
  const rotate = op.rotate ?? 0
  const moves: string[] = []
  if (dx !== 0)
    moves.push(`${formatMm(Math.abs(dx))} ${dx > 0 ? "right" : "left"}`)
  if (dz !== 0)
    moves.push(`${formatMm(Math.abs(dz))} ${dz > 0 ? "down" : "up"}`)
  const turn = `${formatDegrees(Math.abs(rotate))} ${rotate > 0 ? "clockwise" : "anticlockwise"}`
  if (moves.length > 0 && rotate !== 0) {
    return `Moved ${id} ${moves.join(" and ")} and turned it ${turn}`
  }
  if (moves.length > 0) return `Moved ${id} ${moves.join(" and ")}`
  if (rotate !== 0) return `Rotated ${id} ${turn}`
  return `Left ${id} where it was (nothing to nudge)`
}

function setSummary(id: string, op: SetOp): string {
  const labelPart =
    op.label === undefined
      ? undefined
      : op.label === ""
        ? `Cleared ${id}'s label`
        : `Labelled ${id} "${op.label}"`
  const mirrorWord = op.mirrored ? "mirrored" : "un-mirrored"
  if (labelPart && op.mirrored !== undefined) {
    return `${labelPart} and ${mirrorWord} it`
  }
  if (labelPart) return labelPart
  return `${op.mirrored ? "Mirrored" : "Un-mirrored"} ${id}`
}

export function applyOps(input: ApplyOpsInput): ApplyOpsResult {
  const walls = deriveWalls(input.room.corners)
  let placements: Placement[] = [...input.placements]
  const changes: Change[] = []

  input.ops.forEach((op, index) => {
    const ctx: PlacementContext = { room: input.room, walls, placements }
    const fail = (code: OpErrorCode, detail: string) =>
      new OpError(index, op.op, code, detail)

    const findAsset = (ref: string): ResolvedAsset => {
      const asset = input.assets(ref)
      if (!asset) {
        throw fail(
          "UNKNOWN_ASSET",
          `no asset '${ref}'. Use an asset id or key from search_assets.`
        )
      }
      return asset
    }

    const findPlacement = (id: string): Placement => {
      const placement = placements.find((p) => p.id === id)
      if (!placement) {
        throw fail(
          "UNKNOWN_PLACEMENT",
          `no placement with id '${id}'. Existing ids: ${listIds(
            placements.map((p) => p.id),
            "none (the layout is empty)"
          )}.`
        )
      }
      return placement
    }

    const assetOf = (placement: Placement): ResolvedAsset => {
      const asset = input.assets(placement.assetId)
      if (!asset) {
        throw fail(
          "UNKNOWN_ASSET",
          `the asset of '${placement.id}' (${placement.assetId}) can't be found; swap it for an existing asset or remove it.`
        )
      }
      return asset
    }

    const replace = (updated: Placement) => {
      placements = placements.map((p) => (p.id === updated.id ? updated : p))
    }

    const record = (id: string, summary: string) => {
      changes.push({ index, op: op.op, id, summary })
    }

    try {
      switch (op.op) {
        case "add":
          return applyAdd(op)
        case "move":
          return applyMove(op)
        case "nudge": {
          const existing = findPlacement(op.id)
          replace(
            makePlacement(
              {
                ...existing,
                x: existing.x + (op.dx ?? 0),
                z: existing.z + (op.dz ?? 0),
                facing: roundFacing(existing.facing + (op.rotate ?? 0)),
              },
              existing.label,
              existing.mirrored
            )
          )
          return record(existing.id, nudgeSummary(existing.id, op))
        }
        case "swap":
          return applySwap(op)
        case "set": {
          const existing = findPlacement(op.id)
          if (op.label === undefined && op.mirrored === undefined) {
            throw fail(
              "NOTHING_TO_SET",
              `nothing to change on '${op.id}'. Give a label (empty string clears it) and/or mirrored.`
            )
          }
          replace(
            makePlacement(
              existing,
              op.label === undefined ? existing.label : op.label,
              op.mirrored ?? existing.mirrored
            )
          )
          return record(existing.id, setSummary(existing.id, op))
        }
        case "remove": {
          const existing = findPlacement(op.id)
          placements = placements.filter((p) => p.id !== existing.id)
          return record(existing.id, `Removed ${existing.id}`)
        }
      }
    } catch (error) {
      if (error instanceof PlacementError) {
        throw fail(error.code, error.message)
      }
      throw error
    }

    function applyAdd(add: AddOp): void {
      const asset = findAsset(add.asset)
      const taken = new Set(placements.map((p) => p.id))
      let id: string
      if (add.id !== undefined) {
        if (taken.has(add.id)) {
          throw fail(
            "DUPLICATE_ID",
            `a placement with id '${add.id}' already exists. Choose another id, or leave id out to get a fresh one.`
          )
        }
        id = add.id
      } else {
        const fallback = asset.key ? slugify(asset.key) : "item"
        id = uniqueId(slugify(asset.spec.name, fallback), taken)
      }
      const pose = resolvePosition(add.position, asset.spec, ctx, {
        mirrored: add.mirrored ?? false,
      })
      placements = [
        ...placements,
        makePlacement(
          { id, assetId: asset.id, ...pose },
          add.label,
          add.mirrored
        ),
      ]
      record(
        id,
        `Added ${asset.spec.name} (${id}) ${describePosition(add.position)}`
      )
    }

    function applyMove(move: MoveOp): void {
      const existing = findPlacement(move.id)
      const asset = assetOf(existing)
      const pose = resolvePosition(move.position, asset.spec, ctx, {
        mirrored: existing.mirrored ?? false,
        self: existing.id,
      })
      replace(
        makePlacement(
          { ...existing, ...pose },
          existing.label,
          existing.mirrored
        )
      )
      record(
        existing.id,
        `Moved ${existing.id} ${describePosition(move.position)}`
      )
    }

    function applySwap(swap: SwapOp): void {
      const existing = findPlacement(swap.id)
      const asset = findAsset(swap.asset)
      // Keep centre, facing and elevation — except ceiling items, which
      // hang from the ceiling and so depend on the new item's height.
      const elevation =
        asset.spec.mount === "ceiling"
          ? ceilingElevation(
              asset.spec,
              assetLocalBounds(asset.spec),
              input.room.ceilingHeight
            )
          : existing.elevation
      replace(
        makePlacement(
          { ...existing, assetId: asset.id, elevation },
          existing.label,
          existing.mirrored
        )
      )
      record(existing.id, `Swapped ${existing.id} for ${asset.spec.name}`)
    }
  })

  return { placements, changes }
}
