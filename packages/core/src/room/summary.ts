// Joins per-op change summaries into the one sentence an activity feed
// shows: ["Added sofa", "Moved coffee table 150mm right"] →
// "Added sofa, moved coffee table 150mm right".

/** Summaries beyond this many are counted rather than listed. */
export const MAX_LISTED_CHANGES = 4

/** Lower-case a leading ordinary word ("Moved"), never an id ("D2", "WIN1"). */
function continueSentence(summary: string): string {
  return /^[A-Z][a-z]+\b/.test(summary)
    ? summary.charAt(0).toLowerCase() + summary.slice(1)
    : summary
}

export function joinChangeSummaries(
  summaries: readonly string[],
  maxListed = MAX_LISTED_CHANGES
): string {
  const [first, ...rest] = summaries
  if (first === undefined) return "No changes"
  const listed = [first, ...rest.slice(0, maxListed - 1).map(continueSentence)]
  const hidden = summaries.length - listed.length
  const more =
    hidden > 0 ? ` and ${hidden} more change${hidden === 1 ? "" : "s"}` : ""
  return `${listed.join(", ")}${more}`
}
