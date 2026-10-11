import { describe, expect, it } from "vitest"

import { lint } from "../../src/lint"
import { DEFAULT_PLAN_THEME, planSvg } from "../../src/plan"
import { wallBand } from "../../src/plan/walls"
import { planContext } from "../../src/plan/context"
import { polygonArea } from "../../src/lint/polygons"
import type { RoomGeometry } from "../../src/geometry"
import {
  ASSETS,
  placeAll,
  REALISTIC_LAYOUT,
  REALISTIC_OPS,
  ROOM,
} from "../lint/layouts"
import { assertWellFormed, attributeValues, groups } from "./svg-check"

// planSvg: structure the UI hooks onto, the drawing conventions, options,
// and a stored snapshot of the furnished living room with its lint.

const furnished = () =>
  planSvg({
    room: ROOM,
    placements: REALISTIC_LAYOUT,
    assets: ASSETS,
    lint: lint({ room: ROOM, placements: REALISTIC_LAYOUT, assets: ASSETS }),
  })

/** First "M x z" of a path's d attribute. */
function startOf(d: string): [number, number] {
  const match = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d)
  if (!match) throw new Error(`no move-to in ${d}`)
  return [Number(match[1]), Number(match[2])]
}

describe("planSvg", () => {
  it("is a well-formed standalone SVG in millimetres", () => {
    const svg = furnished()
    assertWellFormed(svg)
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="[-\d. ]+" width="1200" height="\d+"/
    )
    // Every number is rounded to 0.1mm, so output is stable.
    for (const value of [...svg.matchAll(/-?\d+\.\d+/g)].map((m) => m[0])) {
      expect(value).toMatch(/^-?\d+\.\d$/)
    }
  })

  it("is deterministic", () => {
    expect(furnished()).toBe(furnished())
  })

  it("tags every placement, feature and wall for the UI to hook onto", () => {
    const svg = furnished()
    const placementGroups = groups(svg, /class="item /).map(
      (g) => /data-placement-id="([^"]+)"/.exec(g)![1]
    )
    expect(new Set(placementGroups)).toEqual(
      new Set(REALISTIC_LAYOUT.map((p) => p.id))
    )
    const features = new Set(
      groups(svg, /data-feature-id=/).map(
        (g) => /data-feature-id="([^"]+)"/.exec(g)![1]
      )
    )
    for (const feature of ROOM.features) expect(features).toContain(feature.id)
    expect(new Set(attributeValues(svg, "data-wall-id"))).toEqual(
      new Set(["W1", "W2", "W3", "W4", "W5", "W6"])
    )
  })

  it("draws the wall band outside the plaster, broken at doors and windows", () => {
    const ctx = planContext(ROOM, DEFAULT_PLAN_THEME, "t")
    const band = wallBand(ctx)
    // D1, D2 and WIN1 cut the ring into three pieces.
    expect(band).toHaveLength(3)
    const area = band.reduce((sum, [outer]) => sum + polygonArea(outer!), 0)
    const perimeter = ctx.walls.reduce((sum, w) => sum + w.length, 0)
    const gaps = 800 + 760 + 1930
    // A 100mm band along every wall, mitred at the corners: each of the
    // five outside corners adds a 100×100 square, the inside corner (C4)
    // takes one away.
    expect(area).toBeCloseTo((perimeter - gaps) * 100 + 4 * 100 * 100, 0)
  })

  it("swings D2 into the room from its window-end hinge and D1 out into the kitchen", () => {
    const svg = planSvg({ room: ROOM })
    const swing = (id: string) => {
      const [door] = groups(svg, new RegExp(`class="door" data-id="${id}"`))
      return /class="door-swing" d="([^"]+)"/.exec(door!)![1]!
    }
    // D2 on W2 (x = 2,980), hinge at z 6,010: the open leaf points into
    // the room (−x) and the arc ends at the other jamb (z 5,250).
    const d2 = swing("D2")
    expect(startOf(d2)).toEqual([2220, 6010])
    expect(d2).toMatch(/ 2980 5250$/)
    // D1 on W1 (z = 0), hinge at the end (x 1,950), opening out (−z).
    const d1 = swing("D1")
    expect(startOf(d1)).toEqual([1950, -800])
    expect(d1).toMatch(/ 1150 0$/)
  })

  it("draws windows, radiators, piers, sockets, pendants and beams", () => {
    const svg = planSvg({ room: ROOM })
    expect(groups(svg, /class="window" data-id="WIN1"/)).toHaveLength(1)
    expect(groups(svg, /class="feature radiator"/)[0]).toContain(
      'fill="url(#roomer-plan-hatch)"'
    )
    expect(groups(svg, /class="feature obstacle pier"/)[0]).toContain(
      `fill="${DEFAULT_PLAN_THEME.wall}"`
    )
    expect(groups(svg, /class="feature socket"/)).toHaveLength(4)
    expect(groups(svg, /class="feature pendant"/)).toHaveLength(2)
    // Assumed features are dashed; the beam uses the hidden-overhead line.
    expect(groups(svg, /class="feature beam"/)[0]).toContain("stroke-dasharray")
    expect(groups(svg, /class="feature pendant"/)[0]).toContain(
      "stroke-dasharray"
    )
  })

  it("dimensions every wall, chaining the walls either side of the notch", () => {
    const svg = planSvg({ room: ROOM })
    const dimension = (wall: string) =>
      groups(svg, new RegExp(`class="dimension" data-wall-id="${wall}"`))[0]!
    expect(dimension("W1")).toContain(">2,980</text>")
    expect(dimension("W2")).toContain(">7,090</text>")
    // W3 (the step) lines up with W5 below the window; W4 with W2.
    const lineOf = (wall: string) =>
      startOf(/<path d="([^"]+)"/.exec(dimension(wall))![1]!)
    expect(lineOf("W3")[1]).toBe(lineOf("W5")[1])
    expect(lineOf("W4")[0]).toBe(lineOf("W2")[0])
    // …and those sides get an overall dimension.
    const overall = groups(svg, /data-overall="true"/)
    expect(overall.map((g) => />([\d,]+)<\/text>/.exec(g)![1])).toEqual([
      "7,690",
      "2,980",
    ])
    expect(svg).not.toContain('class="corner-angle"')
    for (let i = 1; i <= 6; i++) expect(svg).toContain(`>C${i}</text>`)
  })

  it("marks corners that aren't square with their angle", () => {
    const skewed: RoomGeometry = {
      ...ROOM,
      features: [],
      corners: [
        [0, 0],
        [3000, 0],
        [3050, 4000],
        [0, 4000],
      ],
    }
    const svg = planSvg({ room: skewed })
    const angles = groups(svg, /class="corner-angle"/).map(
      (g) => />([\d.]+°)<\/text>/.exec(g)![1]
    )
    // C2 opens slightly wider than square, so C3 is slightly sharper.
    expect(angles).toEqual(["90.7°", "89.3°"])
  })

  it("labels items inside their footprint, abbreviating or setting thin ones beside", () => {
    const svg = furnished()
    const labels = new Map(
      [
        ...svg.matchAll(
          /<text class="item-label" data-placement-id="([^"]+)"[^>]*>(.*?)<\/text>/g
        ),
      ].map((m) => [
        m[1]!,
        m[2]!
          .replace(/<[^>]+>/g, " ")
          .trim()
          .replace(/\s+/g, " "),
      ])
    )
    expect(labels.get("sofa")).toBe("Sofa")
    expect(labels.get("coffee-table")).toBe("Coffee table")
    expect(labels.get("tv")).toBe("TV")
    expect(labels.get("chair-1")).toMatch(/chair$/)
    expect(labels.size).toBe(REALISTIC_LAYOUT.length)
  })

  it("draws rugs first and dashed, and a facing chevron on furniture", () => {
    const svg = furnished()
    const items = groups(svg, /class="item /)
    expect(items[0]).toContain('data-placement-id="rug"')
    expect(items[0]).toContain("stroke-dasharray")
    expect(groups(svg, /data-placement-id="sofa"/)[0]).toContain(
      'class="front"'
    )
  })

  it("overlays lint: severity outlines on the items and a marker per issue", () => {
    const placements = placeAll([
      ...REALISTIC_OPS,
      { op: "nudge", id: "coffee-table", dx: -480 },
    ])
    const report = lint({ room: ROOM, placements, assets: ASSETS })
    const svg = planSvg({
      room: ROOM,
      placements,
      assets: ASSETS,
      lint: report,
    })
    const outlined = [
      ...svg.matchAll(
        /class="lint-outline (\w+)" data-placement-id="([^"]+)"/g
      ),
    ].map((m) => `${m[2]}:${m[1]}`)
    expect(outlined).toEqual(
      expect.arrayContaining(["sofa:error", "coffee-table:error"])
    )
    expect(attributeValues(svg, "data-issue-codes")).toEqual(
      expect.arrayContaining(["E001", "I201"])
    )
    expect(svg).not.toContain('class="pinch"')
  })

  it("rings the pinch point of a narrow walking route", () => {
    const placements = placeAll([
      ...REALISTIC_OPS,
      { op: "nudge", id: "coffee-table", dx: 350 },
    ])
    const report = lint({ room: ROOM, placements, assets: ASSETS })
    const svg = planSvg({
      room: ROOM,
      placements,
      assets: ASSETS,
      lint: report,
    })
    expect(svg).toContain('class="pinch"')
  })
})

describe("planSvg options", () => {
  it("sizes the output by width, keeping the room's proportions", () => {
    const svg = planSvg({ room: ROOM, options: { width: 600 } })
    const [, , , w, h] =
      /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!
    const height = Number(/ height="(\d+)"/.exec(svg)![1])
    expect(svg).toContain(' width="600"')
    expect(height).toBe(Math.round((600 * Number(h)) / Number(w)))
  })

  it("adds a title block only when asked", () => {
    expect(planSvg({ room: ROOM })).not.toContain("<title>")
    const titled = planSvg({
      room: ROOM,
      options: { title: "Living & dining" },
    })
    expect(titled).toContain("<title>Living &amp; dining</title>")
    expect(titled).toContain("2,980 × 7,690 mm · ceiling 2,450 mm")
    assertWellFormed(titled)
  })

  it("can leave out dimensions and labels", () => {
    const svg = planSvg({
      room: ROOM,
      placements: REALISTIC_LAYOUT,
      assets: ASSETS,
      options: { showDimensions: false, showLabels: false },
    })
    expect(svg).not.toContain('class="dimension"')
    expect(svg).not.toContain('class="item-label"')
    expect(svg).not.toContain('class="feature-id"')
    assertWellFormed(svg)
  })

  it("emphasises highlighted placements and features", () => {
    const svg = planSvg({
      room: ROOM,
      placements: REALISTIC_LAYOUT,
      assets: ASSETS,
      options: { highlight: ["sofa", "D2"] },
    })
    expect(
      groups(svg, /class="highlight" data-placement-id="sofa"/)
    ).toHaveLength(1)
    expect(svg).toMatch(/class="highlight" data-feature-id="D2"/)
  })

  it("draws highlights as a dashed ink halo, unlike lint's outlines", () => {
    const report = lint({
      room: ROOM,
      placements: REALISTIC_LAYOUT,
      assets: ASSETS,
    })
    const svg = planSvg({
      room: ROOM,
      placements: REALISTIC_LAYOUT,
      assets: ASSETS,
      lint: report,
      options: { highlight: ["sofa"] },
    })
    const [group] = groups(svg, /class="highlight" data-placement-id="sofa"/)
    expect(group).toContain(`stroke="${DEFAULT_PLAN_THEME.text}"`)
    expect(group).toContain("stroke-dasharray")
    expect(group).toContain('fill="none"')
    for (const colour of [
      DEFAULT_PLAN_THEME.error,
      DEFAULT_PLAN_THEME.warning,
      DEFAULT_PLAN_THEME.accent,
    ]) {
      expect(group).not.toContain(colour)
    }
    // A theme can choose the highlight colour.
    const themed = planSvg({
      room: ROOM,
      placements: REALISTIC_LAYOUT,
      assets: ASSETS,
      options: { highlight: ["sofa"], theme: { highlight: "#123456" } },
    })
    expect(
      groups(themed, /class="highlight" data-placement-id="sofa"/)[0]
    ).toContain('stroke="#123456"')
  })

  it("matches the stored drawing of a highlighted item next to lint", async () => {
    await expect(
      planSvg({
        room: ROOM,
        placements: REALISTIC_LAYOUT,
        assets: ASSETS,
        lint: lint({
          room: ROOM,
          placements: REALISTIC_LAYOUT,
          assets: ASSETS,
        }),
        options: { highlight: ["sofa", "coffee-table", "D2"] },
      })
    ).toMatchFileSnapshot("__snapshots__/living-room-highlight.svg")
  })

  it("takes theme overrides and an id prefix", () => {
    const svg = planSvg({
      room: ROOM,
      options: {
        theme: { wall: "#000000", fontFamily: "Test Sans" },
        idPrefix: "plan-2",
      },
    })
    expect(svg).toContain('class="walls" d=')
    expect(svg).toMatch(/class="walls" d="[^"]+" fill="#000000"/)
    expect(svg).toContain('font-family="Test Sans"')
    expect(svg).toContain('id="plan-2-hatch"')
    expect(svg).toContain("url(#plan-2-hatch)")
  })

  it("skips placements whose asset is missing", () => {
    const svg = planSvg({
      room: ROOM,
      placements: [
        {
          id: "ghost",
          assetId: "nope",
          x: 1000,
          z: 1000,
          facing: 0,
          elevation: 0,
        },
      ],
      assets: ASSETS,
    })
    expect(svg).not.toContain("ghost")
  })

  it("matches the stored drawing of the furnished living room", async () => {
    await expect(furnished()).toMatchFileSnapshot(
      "__snapshots__/living-room-layout.svg"
    )
  })
})
