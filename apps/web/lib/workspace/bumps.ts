// Walk-mode bump announcements: sliding along a wall reports the same bump
// every frame, so only announce a thing again after a quiet spell.

export interface BumpLike {
  /** What was hit: a placement id, feature id, "wall" or "ceiling". */
  bumped: string
  /** Simulation time, seconds. */
  at: number
}

/** Seconds before the same thing is announced again. */
export const BUMP_REPEAT_S = 2

/** Should this bump be announced, given the last one that was? */
export function shouldAnnounceBump(
  last: BumpLike | null,
  bump: BumpLike,
  repeatS: number = BUMP_REPEAT_S
): boolean {
  if (!last) return true
  if (last.bumped !== bump.bumped) return true
  return bump.at - last.at >= repeatS
}
