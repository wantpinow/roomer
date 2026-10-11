import { describe, expect, it } from "vitest"

import {
  formatLintCounts,
  formatLintDelta,
  lintDelta,
  pluraliseSeverity,
  totalIssues,
  worstSeverity,
} from "../lint"

const counts = (error: number, warning: number, info: number) => ({
  error,
  warning,
  info,
})

describe("pluraliseSeverity", () => {
  it("uses singular for one and plural otherwise", () => {
    expect(pluraliseSeverity(1, "error")).toBe("1 error")
    expect(pluraliseSeverity(0, "warning")).toBe("0 warnings")
    expect(pluraliseSeverity(3, "info")).toBe("3 notes")
  })
})

describe("totalIssues", () => {
  it("adds every level", () => {
    expect(totalIssues(counts(2, 1, 4))).toBe(7)
  })
})

describe("worstSeverity", () => {
  it("returns the most severe level present", () => {
    expect(worstSeverity(counts(1, 3, 2))).toBe("error")
    expect(worstSeverity(counts(0, 3, 2))).toBe("warning")
    expect(worstSeverity(counts(0, 0, 2))).toBe("info")
  })

  it("returns null for a clean layout", () => {
    expect(worstSeverity(counts(0, 0, 0))).toBeNull()
  })
})

describe("formatLintCounts", () => {
  it("lists non-zero levels, most severe first", () => {
    expect(formatLintCounts(counts(2, 0, 1))).toBe("2 errors, 1 note")
  })

  it("says No issues when clean", () => {
    expect(formatLintCounts(counts(0, 0, 0))).toBe("No issues")
  })
})

describe("lintDelta", () => {
  it("reports only the levels that changed", () => {
    expect(lintDelta(counts(2, 1, 0), counts(0, 1, 1))).toEqual([
      { severity: "error", before: 2, after: 0 },
      { severity: "info", before: 0, after: 1 },
    ])
  })

  it("is empty when nothing changed", () => {
    expect(lintDelta(counts(1, 1, 1), counts(1, 1, 1))).toEqual([])
  })
})

describe("formatLintDelta", () => {
  it("writes each change as before → after", () => {
    expect(formatLintDelta(counts(2, 1, 0), counts(0, 3, 0))).toBe(
      "errors 2 → 0 · warnings 1 → 3"
    )
  })

  it("is empty when nothing changed", () => {
    expect(formatLintDelta(counts(0, 0, 0), counts(0, 0, 0))).toBe("")
  })
})
