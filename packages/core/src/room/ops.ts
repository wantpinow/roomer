import { formatMm, formatNumber } from "../geometry/format"
import type { RoomGeometry } from "../geometry/room-geometry"
import {
  isWallFeature,
  type Feature,
  type Finishes,
  type RoomSpec,
  type ShellOp,
} from "../schema"
import { assignFeatureId } from "./ids"
import { featureName, featureProblems } from "./validate"

// Applies a batch of room edits (`apply_shell_changes`) in order. Pure and
// atomic: it returns the edited room plus one sentence per op for the
// activity feed, or throws a ShellOpError (nothing applied) that points at
// the op to fix.

/** The parts of a room that shell ops read and write. */
export type ShellRoom = RoomGeometry & Pick<RoomSpec, "name" | "finishes">

export interface ShellChange {
  index: number
  op: ShellOp["op"]
  /** The feature the op acted on, for feature ops. */
  featureId?: string
  /** Short sentence for the activity feed, e.g. "Added door D3 on W2". */
  summary: string
}

export interface ApplyShellOpsResult {
  room: ShellRoom
  changes: ShellChange[]
}

/** A shell op that couldn't be applied; nothing in the batch was applied. */
export class ShellOpError extends Error {
  /** Index into the ops list, when the problem can be pinned on one op. */
  readonly opIndex: number | undefined
  readonly op: ShellOp["op"] | undefined
  /** Every problem found (several when the final room fails validation). */
  readonly issues: string[]

  constructor(
    opIndex: number | undefined,
    op: ShellOp["op"] | undefined,
    issues: [string, ...string[]]
  ) {
    const [first, ...rest] = issues
    const more =
      rest.length === 0
        ? ""
        : ` (and ${rest.length} more problem${rest.length === 1 ? "" : "s"})`
    super(
      opIndex === undefined
        ? `${first}${more}`
        : `ops[${opIndex}] (${op}): ${first}${more}`
    )
    this.name = "ShellOpError"
    this.opIndex = opIndex
    this.op = op
    this.issues = issues
  }
}

const n = (value: number): string => formatNumber(value)

function where(feature: Feature): string {
  return isWallFeature(feature)
    ? `on ${feature.wall} at ${formatMm(feature.offset)}`
    : `at (${n(feature.x)}, ${n(feature.z)})`
}

/** "a door", "an opening". */
function typeWithArticle(feature: Feature): string {
  const words = feature.type.replace(/-/g, " ")
  return `${/^[aeiou]/.test(words) ? "an" : "a"} ${words}`
}

function formatValue(value: unknown): string {
  if (value === undefined) return "none"
  if (typeof value === "number") return n(value)
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

/** "offset 120 → 200, width 1,930 → 1,800" for the fields that changed. */
function describeDiff(before: Feature, after: Feature): string {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  keys.delete("id")
  const before_: Record<string, unknown> = before
  const after_: Record<string, unknown> = after
  const parts = [...keys]
    .filter(
      (key) => JSON.stringify(before_[key]) !== JSON.stringify(after_[key])
    )
    .map(
      (key) =>
        `${key} ${formatValue(before_[key])} → ${formatValue(after_[key])}`
    )
  return parts.length === 0 ? "no changes" : parts.join(", ")
}

function existingIds(features: readonly Feature[]): string {
  return features.length === 0
    ? "the room has no features yet"
    : `existing features: ${features.map((f) => f.id).join(", ")}`
}

function mergeFinishes(current: Finishes, patch: Finishes): Finishes {
  const next: Record<string, string> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (value === "") delete next[key]
    else next[key] = value
  }
  return next
}

export function applyShellOps(
  room: ShellRoom,
  ops: readonly ShellOp[]
): ApplyShellOpsResult {
  let next: ShellRoom = { ...room, features: [...room.features] }
  const changes: ShellChange[] = []
  // Last op index that touched each feature id — used to pin validation
  // problems in the final room on the op that caused them.
  const touched = new Map<string, number>()

  ops.forEach((op, index) => {
    const fail = (message: string): never => {
      throw new ShellOpError(index, op.op, [message])
    }
    switch (op.op) {
      case "addFeature": {
        const requested = op.feature.id
        if (
          requested !== undefined &&
          next.features.some((f) => f.id === requested)
        ) {
          fail(
            `A feature with id ${requested} already exists. Leave out id to have one assigned, or choose another.`
          )
        }
        const id =
          requested ??
          assignFeatureId(
            op.feature.type,
            next.features.map((f) => f.id)
          )
        const feature: Feature = { ...op.feature, id }
        next = { ...next, features: [...next.features, feature] }
        touched.set(id, index)
        changes.push({
          index,
          op: op.op,
          featureId: id,
          summary: `Added ${featureName(feature)} ${where(feature)}`,
        })
        return
      }
      case "updateFeature": {
        const position = next.features.findIndex((f) => f.id === op.id)
        const before = next.features[position]
        if (!before) {
          return fail(
            `There's no feature ${op.id} (${existingIds(next.features)}).`
          )
        }
        const after: Feature = { ...op.feature, id: op.id }
        const features = [...next.features]
        features[position] = after
        next = { ...next, features }
        touched.set(op.id, index)
        changes.push({
          index,
          op: op.op,
          featureId: op.id,
          summary:
            before.type === after.type
              ? `Updated ${featureName(after)}: ${describeDiff(before, after)}`
              : `Changed ${op.id} from ${typeWithArticle(before)} to ${typeWithArticle(after)}`,
        })
        return
      }
      case "removeFeature": {
        const feature = next.features.find((f) => f.id === op.id)
        if (!feature) {
          return fail(
            `There's no feature ${op.id} (${existingIds(next.features)}).`
          )
        }
        next = {
          ...next,
          features: next.features.filter((f) => f.id !== op.id),
        }
        touched.delete(op.id)
        changes.push({
          index,
          op: op.op,
          featureId: op.id,
          summary: `Removed ${featureName(feature)}`,
        })
        return
      }
      case "setSkirting":
        next = { ...next, skirting: op.skirting }
        changes.push({
          index,
          op: op.op,
          summary: `Set the skirting to ${formatMm(op.skirting.height)} high × ${formatMm(op.skirting.depth)} deep`,
        })
        return
      case "setCeilingHeight":
        next = { ...next, ceilingHeight: op.ceilingHeight }
        // Every feature's fit against the ceiling now depends on this op.
        for (const feature of next.features) touched.set(feature.id, index)
        changes.push({
          index,
          op: op.op,
          summary: `Set the ceiling height to ${formatMm(op.ceilingHeight)}`,
        })
        return
      case "setFinishes": {
        const fields = Object.entries(op.finishes).filter(
          ([, value]) => value !== undefined
        )
        if (fields.length === 0) {
          return fail(
            "No finishes given. Pass at least one of walls, floor, ceiling, skirting or notes (an empty string removes one)."
          )
        }
        next = { ...next, finishes: mergeFinishes(next.finishes, op.finishes) }
        const set = fields.filter(([, v]) => v !== "").map(([k]) => k)
        const cleared = fields.filter(([, v]) => v === "").map(([k]) => k)
        const parts = [
          ...(set.length > 0 ? [`set the ${set.join(", ")} finish`] : []),
          ...(cleared.length > 0
            ? [`cleared the ${cleared.join(", ")} finish`]
            : []),
        ]
        const summary = parts.join(" and ")
        changes.push({
          index,
          op: op.op,
          summary: summary.charAt(0).toUpperCase() + summary.slice(1),
        })
        return
      }
      case "rename":
        changes.push({
          index,
          op: op.op,
          summary: `Renamed the room from '${next.name}' to '${op.name}'`,
        })
        next = { ...next, name: op.name }
        return
    }
  })

  // Validate the end state, not each step, so a batch can pass through an
  // intermediate state (e.g. lower a window, then the ceiling). Problems the
  // room already had are not this batch's fault.
  const before = new Set(featureProblems(room).map((p) => p.message))
  const introduced = featureProblems(next).filter((p) => !before.has(p.message))
  const [first] = introduced
  if (first) {
    const blame = (ids: readonly string[]): number | undefined => {
      const indices = ids.flatMap((id) => {
        const at = touched.get(id)
        return at === undefined ? [] : [at]
      })
      return indices.length === 0 ? undefined : Math.max(...indices)
    }
    const opIndex = blame(first.featureIds)
    throw new ShellOpError(
      opIndex,
      opIndex === undefined ? undefined : ops[opIndex]?.op,
      [first.message, ...introduced.slice(1).map((p) => p.message)]
    )
  }

  return { room: next, changes }
}
