import { formatMm, formatNumber } from "../geometry/format"
import {
  area,
  isSimplePolygon,
  rectPolygon,
  signedArea,
} from "../geometry/polygon"
import { intersect, minWidth } from "../lint/polygons"
import {
  DIMS_TOLERANCE_MM,
  LINT_THRESHOLDS,
  MAX_EXPANDED_PARTS,
  type AssetSpec,
  type ExtrudePart,
  type Part,
} from "../schema"
import { assetLocalBounds, partLocalBounds, type Aabb3 } from "./bounds"
import { partCollisionShape } from "./collision"
import { expandedPartCount, expandParts } from "./expand"
import { cleanProfile, offsetPolygon } from "./shapes"

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

/**
 * How far a part may dip below y 0 with only a warning: the lowest rim of a
 * tilted, tapered leg is fiddly to compute by hand, and 3mm is invisible.
 */
export const FLOOR_DIP_TOLERANCE_MM = 3

/** Sides of a clearance zone, mm: thinner is no use, bigger is a mistake. */
export const CLEARANCE_ZONE_MIN_MM = 100
export const CLEARANCE_ZONE_MAX_MM = 4000

/** A zone further than this from the item's footprint doesn't belong to it. */
export const CLEARANCE_ZONE_REACH_MM = 50

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

/**
 * Why a bevel doesn't fit its profile (inset by the bevel, the outline must
 * keep its shape: still simple, same winding, no edge turned round), or
 * undefined when it fits.
 */
export function bevelProblem(
  part: Pick<ExtrudePart, "profile" | "depth" | "bevel">
): string | undefined {
  const bevel = part.bevel
  if (bevel === undefined) return undefined
  if (bevel * 2 > part.depth) {
    return `its bevel of ${formatMm(bevel)} is more than half its depth (${formatMm(part.depth)}); use at most ${formatMm(Math.floor(part.depth / 2))}`
  }
  const profile = cleanProfile(part.profile)
  if (profile.length < 3 || !isSimplePolygon(profile)) return undefined
  const inset = offsetPolygon(profile, -bevel)
  const turned = profile.some((p, i) => {
    const q = profile[(i + 1) % profile.length]!
    const a = inset[i]!
    const b = inset[(i + 1) % inset.length]!
    return (q[0] - p[0]) * (b[0] - a[0]) + (q[1] - p[1]) * (b[1] - a[1]) <= 0
  })
  const flipped =
    Math.sign(signedArea(inset)) !== Math.sign(signedArea(profile))
  if (turned || flipped || !isSimplePolygon(inset)) {
    return `its profile is too narrow somewhere for a bevel of ${formatMm(bevel)} (inset by the bevel, the outline folds over itself); use a bevel under half the profile's narrowest width`
  }
  return undefined
}

function clearanceZoneProblems(asset: AssetSpec, parts: readonly Part[]) {
  const errors: string[] = []
  const warnings: string[] = []
  const zones = asset.clearanceZones ?? []
  if (zones.length === 0) return { errors, warnings }
  const tolerance = LINT_THRESHOLDS.overlapToleranceMm
  // What a zone may not overlap: the parts at walking height (a table top
  // overhanging legroom is fine above 1m, which nothing is).
  const shapes = parts
    .map(partCollisionShape)
    .filter(
      (shape) =>
        shape.footprint.length >= 3 &&
        shape.y0 < LINT_THRESHOLDS.walkingHeightMm
    )
  for (const zone of zones) {
    const [x0, z0, x1, z1] = zone.rect
    const label = `Clearance zone '${zone.name}' [${zone.rect.map(n).join(", ")}]`
    if (x1 <= x0 || z1 <= z0) {
      errors.push(
        `${label} is empty: rect is [minX, minZ, maxX, maxZ], so maxX must be more than minX and maxZ more than minZ.`
      )
      continue
    }
    const width = x1 - x0
    const depth = z1 - z0
    if (Math.min(width, depth) < CLEARANCE_ZONE_MIN_MM) {
      errors.push(
        `${label} is only ${formatMm(width)} × ${formatMm(depth)}; a zone people use is at least ${formatMm(CLEARANCE_ZONE_MIN_MM)} on each side (legroom is usually 400–600mm deep).`
      )
    } else if (Math.max(width, depth) > CLEARANCE_ZONE_MAX_MM) {
      errors.push(
        `${label} is ${formatMm(width)} × ${formatMm(depth)}; at most ${formatMm(CLEARANCE_ZONE_MAX_MM)} on a side — keep it to the space the item itself needs.`
      )
    }
    const rect = rectPolygon(x0, z0, x1, z1)
    const inside = shapes.flatMap((shape) =>
      intersect(shape.footprint, rect)
        .filter((region) => minWidth(region) > tolerance)
        .map((region) => ({ shape, depth: minWidth(region) }))
    )
    if (inside.length > 0) {
      const deepest = inside.reduce((a, b) => (b.depth > a.depth ? b : a))
      errors.push(
        `${label} overlaps the item's own part '${deepest.shape.part}' by ${formatMm(Math.round(deepest.depth))}. A zone is free floor beside the item (it may touch it): move its edge to the part's edge.`
      )
      continue
    }
    const reach = CLEARANCE_ZONE_REACH_MM
    const near = rectPolygon(x0 - reach, z0 - reach, x1 + reach, z1 + reach)
    const touches = shapes.some(
      (shape) => intersect(shape.footprint, near).length > 0
    )
    if (!touches) {
      warnings.push(
        `${label} doesn't touch the item (it is more than ${formatMm(reach)} from every part). Clearance usually starts right at the item's edge.`
      )
    }
  }
  return { errors, warnings }
}

export function validateAsset(asset: AssetSpec): AssetValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const count = expandedPartCount(asset.geometry.parts)
  if (count > MAX_EXPANDED_PARTS) {
    errors.push(
      `The parts expand to ${n(count)} with their repeats; the most an asset may have is ${MAX_EXPANDED_PARTS}. Use fewer or wider repeated copies (e.g. a slat every 40mm instead of every 25mm).`
    )
    return { ok: false, errors, warnings, bounds: assetLocalBounds(asset) }
  }
  const bounds = assetLocalBounds(asset)
  const expanded = expandParts(asset.geometry.parts)
  const parts: PartBounds[] = expanded.map((part) => ({
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

  // Nothing below the floor; floor items stand on it. A dip of a few mm
  // (the rim of a tilted leg) is only worth a warning.
  for (const { part, bounds: b } of parts) {
    const dip = -b.min[1]
    if (dip > FLOOR_DIP_TOLERANCE_MM) {
      errors.push(
        `Part '${part.name}' goes ${formatMm(dip)} below the floor (its bottom is at y ${n(b.min[1])}). Nothing may go below y 0 — raise it by ${formatMm(dip)}.`
      )
    } else if (dip > FLOOR_CONTACT_TOLERANCE_MM) {
      warnings.push(
        `Part '${part.name}' dips ${formatMm(dip)} below the floor (its bottom is at y ${n(b.min[1])}); harmless, but raise it by ${formatMm(Math.ceil(dip))} to sit exactly on y 0.`
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

  // Shape-specific checks (once per written part, not per copy).
  for (const part of asset.geometry.parts) {
    switch (part.shape) {
      case "roundedBox": {
        const [w, h, d] = part.size
        const vertical = part.edges === "vertical"
        const limit = (vertical ? Math.min(w, d) : Math.min(w, h, d)) / 2
        if (part.radius > limit) {
          errors.push(
            vertical
              ? `Part '${part.name}' has an edge radius of ${formatMm(part.radius)} but it is only ${formatMm(limit * 2)} across (width or depth); with edges 'vertical' the radius can be at most ${formatMm(limit)} (half the smaller of width and depth — exactly that makes a stadium).`
              : `Part '${part.name}' has an edge radius of ${formatMm(part.radius)} but its smallest side is ${formatMm(limit * 2)}; the radius can be at most ${formatMm(limit)} (half the smallest side).`
          )
        }
        break
      }
      case "extrude": {
        const profile = cleanProfile(part.profile)
        if (profile.length < 3 || !isSimplePolygon(profile)) {
          errors.push(
            `Part '${part.name}' has a self-intersecting profile (its outline crosses itself). List the profile points in order around the shape, without repeating the first point at the end.`
          )
        } else if (area(profile) === 0) {
          errors.push(
            `Part '${part.name}' has a profile with no area (all its points lie on a line).`
          )
        } else {
          const problem = bevelProblem(part)
          if (problem) errors.push(`Part '${part.name}': ${problem}.`)
        }
        break
      }
      case "torus":
        if (part.tube > part.radius) {
          errors.push(
            `Part '${part.name}' is a torus whose tube (${formatMm(part.tube)}) is fatter than its ring radius (${formatMm(part.radius)}), so it would pass through its own centre. Make tube at most radius.`
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
      case "capsule":
      case "lathe":
        break
    }
  }

  const zones = clearanceZoneProblems(asset, expanded)
  errors.push(...zones.errors)
  warnings.push(...zones.warnings)

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
