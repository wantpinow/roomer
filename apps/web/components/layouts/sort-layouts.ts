import type { LayoutStatus } from "@roomer/core/schema"

const STATUS_RANK: Record<LayoutStatus, number> = {
  favourite: 0,
  candidate: 1,
  draft: 2,
  archived: 3,
}

/**
 * Orders layouts for the rail: favourites, then candidates, then drafts —
 * most recently changed first within each — with archived ones split off.
 */
export function sortLayouts<
  T extends { status: LayoutStatus; updatedAt: number },
>(layouts: readonly T[]): { active: T[]; archived: T[] } {
  const sorted = [...layouts].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.updatedAt - a.updatedAt
  )
  return {
    active: sorted.filter((l) => l.status !== "archived"),
    archived: sorted.filter((l) => l.status === "archived"),
  }
}
