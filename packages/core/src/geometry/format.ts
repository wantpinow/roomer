// Number formatting for agent- and human-facing messages. Plain string work
// (no Intl) so it behaves identically in Convex's V8 runtime, browsers and
// Node.

/** 2150 → "2,150"; −1075.4 → "-1,075". Rounds to `decimals` places. */
export function formatNumber(value: number, decimals = 0): string {
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  const [whole = "0", fraction] = Math.abs(rounded).toFixed(decimals).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const sign = rounded < 0 ? "-" : ""
  return fraction === undefined
    ? `${sign}${grouped}`
    : `${sign}${grouped}.${fraction}`
}

/** Whole millimetres with thousands separators: 2150 → "2,150mm". */
export function formatMm(value: number): string {
  return `${formatNumber(value)}mm`
}

/** Degrees to at most one decimal place: 90 → "90°", 91.25 → "91.3°". */
export function formatDegrees(value: number): string {
  const tenths = Math.round(value * 10) / 10
  return `${formatNumber(tenths, Number.isInteger(tenths) ? 0 : 1)}°`
}
