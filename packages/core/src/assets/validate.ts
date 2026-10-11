import { formatMm, formatNumber } from "../geometry/format"
import { area, isSimplePolygon } from "../geometry/polygon"
import { DIMS_TOLERANCE_MM, type AssetSpec, type Part } from "../schema"
import { assetLocalBounds, partLocalBounds, type Aabb3 } from "./bounds"

// Checks an asset's parts against its listed dims and the item-local frame
// conventions before it is saved. Messages go straight to the agent that
// built the model, so each one names the part(s), gives the numbers and says
// what to change.

export interface AssetValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
  bounds: Aabb3
}

/** How far a floor item's lowest part may float above (or dip below) y 0. */
export const FLOOR_CONTACT_TOLERANCE_MM = 1

const AXES = [
  { index: 0, axis: "x", dim: "w", extent: "wide", over: "too wide" },
  { index: 1, axis: "y", dim: "h", extent: "high", over: "too tall" },
  { index: 2, axis: "z", dim: "d", extent: "deep", over: "too deep" },
] as const

const n = (value: number): string => formatNumber(value)

interface PartBounds {
  part: Part
  bounds: Aabb3
}

/** The part whose bounds reach furthest in one direction along an axis. */
function extremePart(
  parts: readonly PartBounds[],
  index: 0 | 1 | 2,
  side: "min" | "max"
): PartBounds {
  return parts.reduce((best, candidate) =>
    side === "min"
      ? candidate.bounds.min[index] < best.bounds.min[index]
        ? candidate
        : best
      : candidate.bounds.max[index] > best.bounds.max[index]
        ? candidate
        : best
  )
}

export function validateAsset(asset: AssetSpec): AssetValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const bounds = assetLocalBounds(asset)
  const parts: PartBounds[] = asset.geometry.parts.map((part) => ({
    part,
    bounds: partLocalBounds(part),
  }))

  // Overall size must match the listed dims.
  for (const { index, axis, dim, extent, over } of AXES) {
    const min = bounds.min[index]
    const max = bounds.max[index]
    const size = max - min
    const target = asset.dims[dim]
    const diff = size - target
    if (Math.abs(diff) <= DIMS_TOLERANCE_MM) continue
    const low = extremePart(parts, index, "min")
    const high = extremePart(parts, index, "max")
    const extremes =
      low === high
        ? `The only part reaching both ends is '${low.part.name}'.`
        : `The outermost parts are '${low.part.name}' (${axis} ${n(min)}) and '${high.part.name}' (${axis} ${n(max)}).`
    errors.push(
      `Parts span ${formatMm(size)} ${extent} (${axis} ${n(min)} to ${n(max)}) but dims.${dim} is ${formatMm(target)} (${formatMm(Math.abs(diff))} ${diff < 0 ? "short" : over}). ${extremes} Resize or move parts so they span exactly dims.${dim}, or fix dims.${dim} if the listing is wrong.`
    )
  }

  // The origin is the centre of the footprint (x and z).
  for (const { index, axis } of [AXES[0], AXES[2]]) {
    const min = bounds.min[index]
    const max = bounds.max[index]
    const centre = (min + max) / 2
    if (Math.abs(centre) <= DIMS_TOLERANCE_MM) continue
    errors.push(
      `The footprint isn't centred on the origin: parts span ${axis} ${n(min)} to ${n(max)}, so its centre is at ${axis} ${n(centre)}. The origin must be the middle of the footprint — move every part by ${formatMm(-centre)} in ${axis}.`
    )
  }

  // Nothing below the floor; floor items stand on it.
  for (const { part, bounds: b } of parts) {
    if (b.min[1] < -FLOOR_CONTACT_TOLERANCE_MM) {
      errors.push(
        `Part '${part.name}' goes ${formatMm(-b.min[1])} below the floor (its bottom is at y ${n(b.min[1])}). Nothing may go below y 0 — raise it by ${formatMm(-b.min[1])}.`
      )
    }
  }
  const lowest = extremePart(parts, 1, "min")
  const lift = bounds.min[1]
  if (lift > FLOOR_CONTACT_TOLERANCE_MM) {
    if (asset.mount === "floor" || asset.mount === "floor-covering") {
      const what =
        asset.mount === "floor" ? "A floor-standing item" : "A floor covering"
      errors.push(
        `Nothing touches the floor: the lowest part, '${lowest.part.name}', starts at y ${n(lift)}. ${what} needs its lowest part at y 0 — move every part down by ${formatMm(lift)}.`
      )
    } else {
      warnings.push(
        `The lowest part, '${lowest.part.name}', starts at y ${n(lift)}, not 0. A placement's elevation is measured to y 0, so this item will hang ${formatMm(lift)} higher than its elevation; move every part down by ${formatMm(lift)}.`
      )
    }
  }

  // Shape-specific checks.
  for (const part of asset.geometry.parts) {
    switch (part.shape) {
      case "roundedBox": {
        const limit = Math.min(...part.size) / 2
        if (part.radius > limit) {
          errors.push(
            `Part '${part.name}' has an edge radius of ${formatMm(part.radius)} but its smallest side is ${formatMm(limit * 2)}; the radius can be at most ${formatMm(limit)} (half the smallest side).`
          )
        }
        break
      }
      case "extrude":
        if (!isSimplePolygon(part.profile)) {
          errors.push(
            `Part '${part.name}' has a self-intersecting profile (its outline crosses itself). List the profile points in order around the shape, without repeating the first point at the end.`
          )
        } else if (area(part.profile) === 0) {
          errors.push(
            `Part '${part.name}' has a profile with no area (all its points lie on a line).`
          )
        }
        break
      case "cylinder":
        if (part.radiusTop === 0 && part.radiusBottom === 0) {
          errors.push(
            `Part '${part.name}' is a cylinder with zero radius at both ends, so it is invisible. Give radiusTop and/or radiusBottom a size.`
          )
        }
        break
      case "box":
      case "sphere":
      case "lathe":
        break
    }
  }

  // Unique names make every message above unambiguous.
  const counts = new Map<string, number>()
  for (const part of asset.geometry.parts) {
    counts.set(part.name, (counts.get(part.name) ?? 0) + 1)
  }
  for (const [name, count] of counts) {
    if (count > 1) {
      warnings.push(
        `${count} parts are called '${name}'. Give each part a unique name (e.g. '${name} left', '${name} right') so problems can point at the right one.`
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings, bounds }
}
