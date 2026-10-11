import type { Point } from "../geometry/angles"
import type { LintIssue, LintReport, LintSeverity } from "../schema"
import type { PlanContext } from "./context"
import { featureOutline } from "./features"
import type { PlanItem } from "./furniture"
import { el, num, ringsPath, text } from "./svg"

// What sits on top of the drawing: highlighted items and features (the
// selection) as a dashed ink halo, lint severities as coloured, filled
// outlines on the items involved (brick for errors, ochre for warnings),
// and a marker with the issue code(s) at each issue's `at` point. A walking
// route's pinch point also gets a dashed ring.

const RANK: Record<LintSeverity, number> = { error: 0, warning: 1, info: 2 }

function colourOf(ctx: PlanContext, severity: LintSeverity): string {
  return ctx.theme[severity]
}

function worstPerPlacement(lint: LintReport): Map<string, LintSeverity> {
  const worst = new Map<string, LintSeverity>()
  for (const issue of lint.issues) {
    for (const id of issue.placementIds) {
      const known = worst.get(id)
      if (!known || RANK[issue.severity] < RANK[known]) {
        worst.set(id, issue.severity)
      }
    }
  }
  return worst
}

export function drawHighlights(
  ctx: PlanContext,
  items: readonly PlanItem[],
  highlight: ReadonlySet<string>
): string {
  if (highlight.size === 0) return ""
  const { theme, metrics } = ctx
  // Ink, dashed and unfilled: lint owns the coloured, filled outlines.
  const ink = theme.highlight ?? theme.text
  const dashes = `${num(metrics.stroke * 4)} ${num(metrics.stroke * 2.5)}`
  const parts: string[] = []
  for (const item of items) {
    if (!highlight.has(item.placement.id)) continue
    const d = item.outline.map((polygon) => ringsPath(polygon)).join("")
    parts.push(
      el("g", { class: "highlight", "data-placement-id": item.placement.id }, [
        el("path", {
          d,
          fill: "none",
          stroke: ink,
          "stroke-opacity": 0.14,
          "stroke-width": metrics.stroke * 7,
          "stroke-linejoin": "round",
        }),
        el("path", {
          d,
          fill: "none",
          stroke: ink,
          "stroke-width": metrics.stroke * 1.6,
          "stroke-dasharray": dashes,
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
        }),
      ])
    )
  }
  for (const feature of ctx.room.features) {
    if (!highlight.has(feature.id)) continue
    const outline = featureOutline(ctx, feature)
    if (!outline) continue
    parts.push(
      el("path", {
        class: "highlight",
        "data-feature-id": feature.id,
        d: ringsPath([outline]),
        fill: ink,
        "fill-opacity": 0.06,
        stroke: ink,
        "stroke-width": metrics.stroke * 1.4,
        "stroke-dasharray": dashes,
        "stroke-linejoin": "round",
      })
    )
  }
  return el("g", { class: "highlights" }, parts)
}

interface Marker {
  at: Point
  issues: LintIssue[]
}

/** Issues whose points are close together share one marker. */
function clusterMarkers(
  issues: readonly LintIssue[],
  radius: number
): Marker[] {
  const markers: Marker[] = []
  for (const issue of issues) {
    if (!issue.at) continue
    const at: Point = [issue.at[0], issue.at[1]]
    const near = markers.find(
      (m) => Math.hypot(m.at[0] - at[0], m.at[1] - at[1]) < radius
    )
    if (near) near.issues.push(issue)
    else markers.push({ at, issues: [issue] })
  }
  return markers
}

export function drawLintOverlay(
  ctx: PlanContext,
  items: readonly PlanItem[],
  lint: LintReport | undefined
): string {
  if (!lint || lint.issues.length === 0) return ""
  const { theme, metrics } = ctx
  const worst = worstPerPlacement(lint)
  const outlines: string[] = []
  for (const item of items) {
    const severity = worst.get(item.placement.id)
    if (!severity || severity === "info") continue
    const colour = colourOf(ctx, severity)
    outlines.push(
      el("path", {
        class: `lint-outline ${severity}`,
        "data-placement-id": item.placement.id,
        "data-severity": severity,
        d: item.outline.map((polygon) => ringsPath(polygon)).join(""),
        fill: colour,
        "fill-opacity": severity === "error" ? 0.14 : 0.1,
        stroke: colour,
        "stroke-width": metrics.stroke * 1.8,
        "stroke-linejoin": "round",
        "fill-rule": "evenodd",
      })
    )
  }

  const size = Math.round(metrics.small * 0.9)
  const markers: string[] = []
  for (const marker of clusterMarkers(lint.issues, size * 3)) {
    const sorted = [...marker.issues].sort(
      (a, b) =>
        RANK[a.severity] - RANK[b.severity] || (a.code < b.code ? -1 : 1)
    )
    const codes = [...new Set(sorted.map((i) => i.code))]
    const severity = sorted[0]!.severity
    const colour = colourOf(ctx, severity)
    const label = codes.join(" · ")
    const width = label.length * size * 0.62 + size * 1.2
    const height = size * 1.6
    const [x, z] = marker.at
    const pinch = sorted.some((i) => i.code === "W101" || i.code === "I202")
    markers.push(
      el(
        "g",
        {
          class: `lint-marker ${severity}`,
          "data-issue-codes": codes.join(" "),
          "data-severity": severity,
        },
        [
          pinch
            ? el("circle", {
                class: "pinch",
                cx: x,
                cy: z,
                r: metrics.font * 2.2,
                fill: "none",
                stroke: colour,
                "stroke-width": metrics.stroke * 1.2,
                "stroke-dasharray": `${num(metrics.stroke * 3)} ${num(metrics.stroke * 2)}`,
              })
            : "",
          el("rect", {
            x: x - width / 2,
            y: z - height / 2,
            width,
            height,
            rx: height / 2,
            fill: colour,
            stroke: theme.paper,
            "stroke-width": metrics.hairline * 2,
          }),
          el(
            "text",
            {
              x,
              y: z + size * 0.36,
              "font-size": size,
              "font-weight": 600,
              "text-anchor": "middle",
              fill: theme.paper,
              "letter-spacing": size * 0.03,
            },
            text(label)
          ),
        ]
      )
    )
  }
  return el("g", { class: "lint" }, [
    el("g", { class: "lint-outlines" }, outlines),
    el("g", { class: "lint-markers" }, markers),
  ])
}
