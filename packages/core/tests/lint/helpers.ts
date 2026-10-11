import { expect } from "vitest"

import type { RoomGeometry } from "../../src/geometry"
import { lint, type LintInput } from "../../src/lint"
import { applyOps } from "../../src/placement"
import type {
  AssetSpec,
  Feature,
  LayoutOp,
  LintCode,
  LintIssue,
  LintReport,
  Placement,
} from "../../src/schema"
import { ASSETS, REALISTIC_LAYOUT, ROOM } from "./layouts"

// Helpers for lint tests: place things with real layout ops on the living
// room, lint, and pick issues out of the report.

/** A plain box asset: w × d × h, standing on the floor. */
export function boxAsset(
  name: string,
  [w, d, h]: [number, number, number],
  extra: Partial<AssetSpec> = {}
): AssetSpec {
  return {
    name,
    category: "other",
    mount: "floor",
    dims: { w, d, h },
    geometry: {
      kind: "parts",
      parts: [
        {
          shape: "box",
          name: "body",
          position: [0, h / 2, 0],
          size: [w, h, d],
        },
      ],
    },
    ...extra,
  }
}

export interface Scenario {
  placements: Placement[]
  report: LintReport
}

export interface ScenarioOptions {
  /** Placements to start from (default: an empty room). */
  base?: readonly Placement[]
  /** Assets beyond the shared ones, keyed by asset id. */
  extraAssets?: Record<string, AssetSpec>
  /** Replace the room's features. */
  features?: Feature[]
  thresholds?: LintInput["thresholds"]
}

/** Apply `ops` with real layout ops, then lint the result. */
export function lintOps(
  ops: readonly LayoutOp[],
  options: ScenarioOptions = {}
): Scenario {
  const assets = { ...ASSETS, ...options.extraAssets }
  const room: RoomGeometry = options.features
    ? { ...ROOM, features: options.features }
    : ROOM
  const { placements } = applyOps({
    room,
    placements: options.base ?? [],
    ops,
    assets: (ref) => {
      const spec = assets[ref]
      return spec ? { id: ref, spec } : undefined
    },
  })
  const report = lint({
    room,
    placements,
    assets,
    ...(options.thresholds ? { thresholds: options.thresholds } : {}),
  })
  return { placements, report }
}

/** Lint the realistic layout after applying `ops` to it. */
export function lintRealistic(
  ops: readonly LayoutOp[] = [],
  options: Omit<ScenarioOptions, "base"> = {}
): Scenario {
  return lintOps(ops, { ...options, base: REALISTIC_LAYOUT })
}

export function issuesOf(report: LintReport, code: LintCode): LintIssue[] {
  return report.issues.filter((issue) => issue.code === code)
}

export function codes(report: LintReport): LintCode[] {
  return report.issues.map((issue) => issue.code)
}

/** The single issue with this code; fails (showing all issues) otherwise. */
export function onlyIssue(report: LintReport, code: LintCode): LintIssue {
  const found = issuesOf(report, code)
  expect(found, JSON.stringify(report.issues, null, 2)).toHaveLength(1)
  return found[0]!
}
