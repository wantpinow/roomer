import { formatNumber } from "@roomer/core/geometry"

import { formatMm } from "./length"

/** Where an item sits, in the agent's wall-relative terms. */
export type ItemPosition =
  | { mode: "against" | "onWall"; wall: string; along: number }
  | { mode: "corner"; corner: string }

/**
 * The position readout for an item: "against W6 · 2,400 mm",
 * "on W2 · 1,200 mm", "in C3" — or the plan coordinates when there's no
 * wall relation: "x 1,490 · z 2,400 mm".
 */
export function formatPosition(
  position: ItemPosition | undefined,
  at: { x: number; z: number }
): string {
  if (!position) return `x ${formatNumber(at.x)} · z ${formatMm(at.z)}`
  if (position.mode === "corner") return `in ${position.corner}`
  const verb = position.mode === "onWall" ? "on" : "against"
  return `${verb} ${position.wall} · ${formatMm(position.along)}`
}
