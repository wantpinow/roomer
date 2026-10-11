// Snapping for plan edits. Positions are whole millimetres; the default grid
// is 10mm (hold Alt to place freely, still rounded to the millimetre).

export const DEFAULT_GRID_MM = 10

/** Rounds to the nearest multiple of `grid` (mm); `grid <= 1` just rounds. */
export function snapMm(value: number, grid: number = DEFAULT_GRID_MM): number {
  if (grid <= 1) return Math.round(value) || 0
  return Math.round(value / grid) * grid || 0
}

/** Snaps a plan point; `free` skips the grid but keeps whole millimetres. */
export function snapPoint(
  [x, z]: readonly [number, number],
  {
    free = false,
    grid = DEFAULT_GRID_MM,
  }: { free?: boolean; grid?: number } = {}
): [number, number] {
  const step = free ? 1 : grid
  return [snapMm(x, step), snapMm(z, step)]
}
