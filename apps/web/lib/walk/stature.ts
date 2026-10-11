// How tall the walker is. Stature is a setting (people want to see the
// room at their own eye level); eye height follows it in proportion —
// eyes sit about 6.5% of stature below the top of the head, so a 6 ft
// (1830 mm) walker looks out at ≈ 1,711 mm.

export interface WalkerSize {
  /** Standing height, mm. */
  height: number
  /** Eye height above the feet, mm. */
  eyeHeight: number
}

/** 6 ft. */
export const DEFAULT_STATURE_MM = 1830
/** Eye height as a share of stature. */
export const EYE_RATIO = 0.935
/** The height setting moves in whole inches between 4′10″ and 6′10″. */
export const STATURE_RANGE_IN = { min: 58, max: 82 } as const

const MM_PER_INCH = 25.4

export function walkerSize(statureMm: number = DEFAULT_STATURE_MM): WalkerSize {
  return { height: statureMm, eyeHeight: Math.round(statureMm * EYE_RATIO) }
}

/** Whole inches, clamped to the setting's range. */
export function statureInches(statureMm: number): number {
  const inches = Math.round(statureMm / MM_PER_INCH)
  return Math.min(STATURE_RANGE_IN.max, Math.max(STATURE_RANGE_IN.min, inches))
}

/**
 * One inch taller (+1) or shorter (−1), clamped; returns whole millimetres.
 * 6′0″ stays exactly 1830 until it's changed.
 */
export function stepStature(statureMm: number, inches: number): number {
  const next = Math.min(
    STATURE_RANGE_IN.max,
    Math.max(STATURE_RANGE_IN.min, statureInches(statureMm) + inches)
  )
  // Untouched and in range: keep the exact value (6 ft stays 1830, not 1829).
  if (next === Math.round(statureMm / MM_PER_INCH)) return statureMm
  return Math.round(next * MM_PER_INCH)
}

/** "6′0″" (feet and inches, typographic primes). */
export function formatStature(statureMm: number): string {
  const inches = Math.round(statureMm / MM_PER_INCH)
  return `${Math.floor(inches / 12)}′${inches % 12}″`
}

/** "1.71 m" */
export function formatEyeHeight(eyeMm: number): string {
  return `${(eyeMm / 1000).toFixed(2)} m`
}

/** A remembered stature (localStorage text), if it's a sensible one. */
export function parseStature(raw: string | null | undefined): number | null {
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  const inches = Math.round(value / MM_PER_INCH)
  if (inches < STATURE_RANGE_IN.min || inches > STATURE_RANGE_IN.max)
    return null
  return Math.round(value)
}
