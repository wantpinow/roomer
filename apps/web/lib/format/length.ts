import { formatNumber } from "@roomer/core/geometry"
import type { Dims } from "@roomer/core/schema"

// Lengths in the UI. Everything is stored in whole millimetres; the UI shows
// either millimetres ("2,980 mm") for anything you'd measure with a tape, or
// metres ("2.98 m") for room-scale figures. Plain spaces before units — the
// <Dimension> component keeps them from wrapping.

export type LengthUnit = "mm" | "m"

/** A formatted length split into number and unit, for typesetting. */
export interface LengthParts {
  value: string
  unit: LengthUnit
}

/** 2980 → { value: "2,980", unit: "mm" }; in metres → { "2.98", "m" }. */
export function lengthParts(mm: number, unit: LengthUnit = "mm"): LengthParts {
  return unit === "m"
    ? { value: formatNumber(mm / 1000, 2), unit }
    : { value: formatNumber(mm), unit }
}

/** 2980 → "2,980 mm". Rounds to whole millimetres. */
export function formatMm(mm: number): string {
  return `${formatNumber(mm)} mm`
}

/** 2980 → "2.98 m"; 7690 → "7.69 m"; 600 → "0.60 m". */
export function formatMetres(mm: number, decimals = 2): string {
  return `${formatNumber(mm / 1000, decimals)} m`
}

/** One length in the requested unit. */
export function formatLength(mm: number, unit: LengthUnit = "mm"): string {
  const { value, unit: u } = lengthParts(mm, unit)
  return `${value} ${u}`
}

/**
 * Overall size, W × D × H, with the unit once at the end:
 * { w: 2310, d: 915, h: 765 } → "2,310 × 915 × 765 mm".
 */
export function formatDims(dims: Dims, unit: LengthUnit = "mm"): string {
  const values = [dims.w, dims.d, dims.h]
  return unit === "m"
    ? `${values.map((v) => formatNumber(v / 1000, 2)).join(" × ")} m`
    : `${values.map((v) => formatNumber(v)).join(" × ")} mm`
}

/** A plan extent, width × depth in metres: (7690, 2980) → "7.69 × 2.98 m". */
export function formatExtent(widthMm: number, depthMm: number): string {
  return `${formatNumber(widthMm / 1000, 2)} × ${formatNumber(depthMm / 1000, 2)} m`
}

/** Floor area from square millimetres: 22_436_000 mm² → "22.4 m²". */
export function formatArea(mm2: number): string {
  const m2 = mm2 / 1_000_000
  return `${formatNumber(m2, m2 < 10 ? 2 : 1)} m²`
}
