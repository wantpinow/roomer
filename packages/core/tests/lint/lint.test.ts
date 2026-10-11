import { describe, expect, it } from "vitest"

import { compareIssues, lint } from "../../src/lint"
import { LINT_RULES, zLintReport, type LintIssue } from "../../src/schema"
import { lintRealistic } from "./helpers"
import { ASSETS, REALISTIC_LAYOUT, ROOM } from "./layouts"

// The report as a whole: shape, ordering, determinism, the realistic room
// and speed (lint runs inside a Convex mutation on every change).

describe("lint", () => {
  it("passes the empty room", () => {
    expect(lint({ room: ROOM, placements: [], assets: {} })).toEqual({
      ok: true,
      counts: { error: 0, warning: 0, info: 0 },
      issues: [],
    })
  })

  it("finds no errors or warnings in a realistic furnished living room", () => {
    const report = lint({
      room: ROOM,
      placements: REALISTIC_LAYOUT,
      assets: ASSETS,
    })
    expect(report.ok).toBe(true)
    expect(report.counts).toEqual({ error: 0, warning: 0, info: 1 })
    // The only note: the sideboard sits in front of socket S1.
    expect(report.issues.map((i) => i.code)).toEqual(["I201"])
  })

  it("returns a report that satisfies the schema, with counts and ok", () => {
    const { report } = lintRealistic([
      { op: "nudge", id: "coffee-table", dx: -500 },
      { op: "nudge", id: "tv", dx: -300 },
      { op: "nudge", id: "sideboard", dx: -40 },
    ])
    expect(zLintReport.parse(report)).toEqual(report)
    expect(report.ok).toBe(false)
    const tally = { error: 0, warning: 0, info: 0 }
    for (const issue of report.issues) {
      expect(issue.severity).toBe(LINT_RULES[issue.code].severity)
      expect(issue.hint).toBeTruthy()
      tally[issue.severity]++
    }
    expect(report.counts).toEqual(tally)
  })

  it("orders issues by severity, code, then ids, and is deterministic", () => {
    const ops = [
      { op: "nudge" as const, id: "coffee-table", dx: -500 },
      { op: "nudge" as const, id: "sideboard", dx: -40 },
      { op: "nudge" as const, id: "chair-1", dx: 300 },
    ]
    const first = lintRealistic(ops).report
    const second = lintRealistic(ops).report
    expect(second).toEqual(first)
    const sorted = [...first.issues].sort(compareIssues)
    expect(first.issues).toEqual(sorted)
    const severities = first.issues.map((i) => i.severity)
    expect(severities).toEqual(
      [...severities].sort(
        (a, b) =>
          ["error", "warning", "info"].indexOf(a) -
          ["error", "warning", "info"].indexOf(b)
      )
    )
  })

  it("compares issues by code-unit order, not locale", () => {
    const base: LintIssue = {
      code: "E001",
      severity: "error",
      message: "m",
      placementIds: ["b"],
      featureIds: [],
    }
    expect(compareIssues(base, { ...base, placementIds: ["a"] })).toBe(1)
    expect(compareIssues(base, { ...base, code: "E002" })).toBe(-1)
    expect(compareIssues(base, { ...base, severity: "info" })).toBeLessThan(0)
    expect(compareIssues(base, { ...base })).toBe(0)
  })

  it("skips placements whose asset is missing", () => {
    const report = lint({
      room: ROOM,
      placements: [
        {
          id: "ghost",
          assetId: "nope",
          x: -500,
          z: -500,
          facing: 0,
          elevation: 0,
        },
      ],
      assets: ASSETS,
    })
    expect(report.issues).toEqual([])
  })

  it("lints the realistic layout well within a mutation's budget", () => {
    const input = { room: ROOM, placements: REALISTIC_LAYOUT, assets: ASSETS }
    lint(input) // warm up the JIT
    const runs: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      lint(input)
      runs.push(performance.now() - start)
    }
    const median = [...runs].sort((a, b) => a - b)[2]!
    expect(median).toBeLessThan(50)
  })
})
