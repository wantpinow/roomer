// "How long ago" for activity, layouts and renders. Pure: the caller passes
// `now` (components take it from `useState(() => Date.now())`), so output is
// deterministic and SSR-safe.

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export interface RelativeTimeOptions {
  /** `long`: "3 min ago"; `short`: "3m" for tight spaces. */
  style?: "long" | "short"
  /** IANA zone for absolute dates; defaults to the runtime's local zone. */
  timeZone?: string
}

/**
 * Elapsed time from `then` to `now` (epoch ms), coarsening as it ages:
 * just now → N min ago → N h ago → yesterday → N days ago → "12 Sep"
 * (→ "12 Sep 2025" in another year). Future times (clock skew) read "just
 * now".
 */
export function formatRelativeTime(
  then: number,
  now: number,
  { style = "long", timeZone }: RelativeTimeOptions = {}
): string {
  const elapsed = Math.max(0, now - then)
  const short = style === "short"

  if (elapsed < 45 * SECOND) return short ? "now" : "just now"
  if (elapsed < HOUR) {
    const minutes = Math.max(1, Math.round(elapsed / MINUTE))
    if (minutes < 60) return short ? `${minutes}m` : `${minutes} min ago`
  }
  if (elapsed < DAY) {
    const hours = Math.max(1, Math.floor(elapsed / HOUR))
    return short ? `${hours}h` : `${hours} h ago`
  }
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY)
    if (short) return `${days}d`
    return days === 1 ? "yesterday" : `${days} days ago`
  }
  return formatDate(then, now, timeZone)
}

function formatDate(then: number, now: number, timeZone?: string): string {
  const year = (t: number) =>
    new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone }).format(t)
  const sameYear = year(then) === year(now)
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(then)
}

/** Full timestamp for tooltips and `<time title>`: "11 Oct 2026, 14:05". */
export function formatTimestamp(
  at: number,
  { timeZone }: Pick<RelativeTimeOptions, "timeZone"> = {}
): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(at)
}
