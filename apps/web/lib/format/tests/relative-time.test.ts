import { describe, expect, it } from "vitest"

import { formatRelativeTime, formatTimestamp } from "../relative-time"

const NOW = Date.UTC(2026, 9, 11, 14, 5, 0) // 11 Oct 2026, 14:05 UTC
const s = 1000
const min = 60 * s
const h = 60 * min
const day = 24 * h
const utc = { timeZone: "UTC" }

describe("formatRelativeTime", () => {
  it("says just now under 45 seconds, and for future times", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now")
    expect(formatRelativeTime(NOW - 44 * s, NOW)).toBe("just now")
    expect(formatRelativeTime(NOW + 5 * min, NOW)).toBe("just now")
  })

  it("counts minutes under an hour", () => {
    expect(formatRelativeTime(NOW - 45 * s, NOW)).toBe("1 min ago")
    expect(formatRelativeTime(NOW - 12 * min, NOW)).toBe("12 min ago")
  })

  it("rolls a rounded 60 minutes over to an hour", () => {
    expect(formatRelativeTime(NOW - 59.6 * min, NOW)).toBe("1 h ago")
  })

  it("counts whole hours under a day", () => {
    expect(formatRelativeTime(NOW - 3 * h - 50 * min, NOW)).toBe("3 h ago")
    expect(formatRelativeTime(NOW - 23 * h, NOW)).toBe("23 h ago")
  })

  it("says yesterday, then days, within a week", () => {
    expect(formatRelativeTime(NOW - 30 * h, NOW)).toBe("yesterday")
    expect(formatRelativeTime(NOW - 6 * day, NOW)).toBe("6 days ago")
  })

  it("falls back to a date after a week", () => {
    expect(formatRelativeTime(NOW - 60 * day, NOW, utc)).toBe("12 Aug")
  })

  it("adds the year for another year", () => {
    expect(formatRelativeTime(Date.UTC(2025, 11, 24), NOW, utc)).toBe(
      "24 Dec 2025"
    )
  })

  it("has a compact style", () => {
    const short = { style: "short" as const }
    expect(formatRelativeTime(NOW - 10 * s, NOW, short)).toBe("now")
    expect(formatRelativeTime(NOW - 5 * min, NOW, short)).toBe("5m")
    expect(formatRelativeTime(NOW - 2 * h, NOW, short)).toBe("2h")
    expect(formatRelativeTime(NOW - 3 * day, NOW, short)).toBe("3d")
  })
})

describe("formatTimestamp", () => {
  it("writes a 24-hour day-month-year timestamp", () => {
    expect(formatTimestamp(NOW, utc)).toBe("11 Oct 2026, 14:05")
  })
})
