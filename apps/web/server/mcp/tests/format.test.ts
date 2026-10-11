import type { Camera, Feature } from "@roomer/core/schema"
import { describe, expect, it } from "vitest"

import {
  assetDetail as assetDetailText,
  assetList,
  bearing,
  bearingWord,
  boundsLine,
  cameraLine,
  changeList,
  dims,
  duration,
  featureGroups,
  featureLine,
  finishes,
  idLegend,
  layoutDetail as layoutDetailText,
  lintReport,
  mm,
  outlineSize,
  overview,
  placementLine,
  price,
  renderList,
  roomDetail as roomDetailText,
  solveReport,
  timestamp,
  wallSide,
} from "../format"

import {
  assetDetail,
  assetSummary,
  layoutDetail,
  LINT_CLEAN,
  LINT_WITH_ERROR,
  NOW,
  renderRecord,
  roomDetail,
  SOFA_ID,
  TABLE_ID,
} from "./fakes"

describe("units", () => {
  it("writes whole millimetres with thousands separators", () => {
    expect(mm(2150)).toBe("2,150mm")
    expect(mm(2149.6)).toBe("2,150mm")
    expect(dims({ w: 2200, d: 950, h: 820 })).toBe("2,200W × 950D × 820H mm")
  })

  it("names bearings with the nearest plan direction", () => {
    expect(bearingWord(0)).toBe("up")
    expect(bearingWord(90)).toBe("right")
    expect(bearingWord(359)).toBe("up")
    expect(bearingWord(-90)).toBe("left")
    expect(bearing(180)).toBe("180° (down)")
    expect(bearing(93)).toBe("93° (≈right)")
    expect(bearing(225)).toBe("225° (down-left)")
  })

  it("places a wall on the plan from the way it faces", () => {
    expect(wallSide(180)).toBe("top wall")
    expect(wallSide(270)).toBe("right wall")
    expect(wallSide(0)).toBe("bottom wall")
    expect(wallSide(90)).toBe("left wall")
    expect(wallSide(135)).toBe("top-left wall")
  })

  it("measures an outline's overall extent", () => {
    expect(
      outlineSize([
        [0, 0],
        [2980, 0],
        [2980, 7090],
        [0, 7690],
      ])
    ).toBe("2,980 × 7,690mm (x × z)")
  })

  it("formats durations and timestamps compactly", () => {
    expect(duration(850)).toBe("850ms")
    expect(duration(42_000)).toBe("42s")
    expect(duration(65_000)).toBe("1m 05s")
    expect(timestamp(NOW)).toBe("2026-10-11 19:15Z")
  })
})

describe("price", () => {
  const base = { amount: 1234, currency: "GBP", mixedCurrencies: false }

  it("totals priced items and counts the rest", () => {
    expect(price({ ...base, unpricedItems: 0 }, 3)).toBe("£1,234")
    expect(price({ ...base, unpricedItems: 2 }, 3)).toBe("£1,234 (+2 unpriced)")
  })

  it("says when nothing is priced or currencies are mixed", () => {
    expect(
      price({ ...base, amount: 0, currency: null, unpricedItems: 3 }, 3)
    ).toBe("no prices")
    expect(
      price(
        { ...base, currency: null, mixedCurrencies: true, unpricedItems: 0 },
        2
      )
    ).toBe("1,234 (mixed currencies)")
    expect(price({ ...base, amount: 0, unpricedItems: 0 }, 0)).toBe("no prices")
  })
})

describe("lintReport", () => {
  it("says clean when there are no issues", () => {
    expect(lintReport(LINT_CLEAN)).toBe(
      "Lint: clean (0 errors, 0 warnings, 0 info)."
    )
  })

  it("lists errors first, then warnings, then info, with hints", () => {
    const text = lintReport(LINT_WITH_ERROR)
    const lines = text.split("\n")
    expect(lines[0]).toBe("Lint: 1 error, 1 warning, 1 info — fix every error.")
    expect(lines[1]).toMatch(/^Errors/)
    expect(lines[2]).toBe(
      "- E001 [sofa, coffee-table] Generic sofa overlaps Generic coffee table by 120mm (x) × 340mm (z). → Move Generic coffee table 130mm towards +x."
    )
    expect(text.indexOf("W103")).toBeGreaterThan(text.indexOf("E001"))
    expect(text.indexOf("I203")).toBeGreaterThan(text.indexOf("W103"))
    expect(text).toContain("[sofa, RAD1]")
  })

  it("caps info notes but never errors or warnings", () => {
    const issues = Array.from({ length: 12 }, (_, i) => ({
      code: "I203" as const,
      severity: "info" as const,
      message: `gap ${i}`,
      placementIds: [],
      featureIds: [],
    }))
    const text = lintReport(
      { ok: true, counts: { error: 0, warning: 0, info: 12 }, issues },
      { maxInfo: 3 }
    )
    expect(text).toContain("gap 2")
    expect(text).not.toContain("gap 3")
    expect(text).toContain("… and 9 more info notes")
    expect(text).not.toContain("fix every error")
  })
})

describe("rooms", () => {
  const room = roomDetail()

  it("reports the solver, flagging a large residual", () => {
    expect(solveReport(room.shell.solve)).toContain(
      "Solved by walk; residual 0mm. Corner angles: C1 90°"
    )
    expect(
      solveReport({
        ...room.shell.solve,
        residualMm: 22,
        warnings: ["W3 short"],
      })
    ).toContain("residual 22mm — over 15mm, re-measure")
    expect(
      solveReport({ ...room.shell.solve, warnings: ["W3 short"] })
    ).toContain("Solver warning: W3 short")
  })

  it("words every feature type", () => {
    const walls = room.walls
    const door = room.features.find((f) => f.id === "D2")!
    expect(featureLine(door, walls)).toMatch(
      /^- D2 ".+" door on W2, 5,250–6,010mm along \(760mm wide, 1,980mm high\), hinged on the C3 side, opens into the room/
    )
    const window = room.features.find((f) => f.id === "WIN1")!
    expect(featureLine(window, walls)).toContain(
      "sill at 650mm, 1,450mm high, opens out, sill sticks out 50mm"
    )
    const others: Feature[] = [
      {
        type: "opening",
        id: "OP1",
        wall: "W1",
        offset: 0,
        width: 900,
        bottom: 0,
        height: 2000,
      },
      {
        type: "switch",
        id: "SW1",
        wall: "W1",
        offset: 100,
        width: 80,
        bottom: 1100,
        height: 80,
      },
      {
        type: "data",
        id: "DATA1",
        wall: "W1",
        offset: 300,
        width: 80,
        bottom: 300,
        height: 80,
      },
      {
        type: "hearth",
        id: "H1",
        x: 100,
        z: 200,
        width: 1000,
        depth: 400,
        height: 50,
      },
      {
        type: "floor-socket",
        id: "FS1",
        x: 500,
        z: 500,
        width: 100,
        depth: 100,
        height: 10,
        facing: 90,
      },
      { type: "ceiling-light", id: "L3", x: 10, z: 20 },
      { type: "pendant", id: "L4", x: 10, z: 20, drop: 600 },
      {
        type: "beam",
        id: "BM1",
        start: [0, 2650],
        end: [2980, 2650],
        width: 250,
        drop: 230,
      },
    ]
    const lines = others.map((f) => featureLine(f, walls))
    expect(lines[0]).toContain("doorless opening on W1, 0–900mm along")
    expect(lines[1]).toContain("switch on W1, 100–180mm along, 1,100mm up")
    expect(lines[2]).toContain("data on W1")
    expect(lines[3]).toContain(
      "hearth centred at (100, 200), 1,000 × 400 × 50mm"
    )
    expect(lines[4]).toContain("facing 90° (right)")
    expect(lines[5]).toContain("ceiling-light at (10, 20)")
    expect(lines[6]).toContain("drop 600mm")
    expect(lines[7]).toBe(
      "- BM1 ceiling beam from (0, 2,650) to (2,980, 2,650), 250mm wide, hangs 230mm below the ceiling"
    )
  })

  it("groups features by kind and marks assumed ones", () => {
    const text = featureGroups(room.features, room.walls)
    expect(text.split("\n")[0]).toBe(`Features (${room.features.length}):`)
    expect(text.indexOf("Doors & openings:")).toBeLessThan(
      text.indexOf("Windows:")
    )
    expect(text).toMatch(/RAD1 .*\[assumed\]/)
    expect(featureGroups([])).toBe("Features: none yet.")
  })

  it("describes where a camera looks", () => {
    const camera: Camera = {
      id: "from-d1",
      name: "From the door",
      position: [1500, 1500, 300],
      target: [1500, 1500, 5000],
      fov: 70,
    }
    expect(cameraLine(camera)).toBe(
      '- from-d1 "From the door": eye at (1,500, 1,500, 300) looking 180° (down), level, fov 70°'
    )
    expect(
      cameraLine({
        ...camera,
        target: [1500, 1000, 3000],
        projection: "fisheye",
      })
    ).toMatch(/tilted \d+° down, fov 70°, fisheye$/)
  })

  it("lists finishes in a fixed order and skips empty ones", () => {
    expect(finishes({ notes: "calm", walls: "white", floor: "" })).toBe(
      'walls "white"; notes "calm"'
    )
    expect(finishes(undefined)).toBe("none")
  })

  it("puts ids, walls, features and cameras in the room readout", () => {
    const text = roomDetailText(room)
    expect(text).toContain(`Room "Living room" — id ${room._id}`)
    expect(text).toContain("- W1 C1→C2 2,980mm · top wall, faces 180° (down)")
    expect(text).toContain("- W6 C6→C1 7,690mm · left wall, faces 90° (right)")
    expect(text).toContain(`Cameras (${room.cameras.length}):`)
    expect(text).toContain("Reference photos: 0")
  })
})

describe("overview", () => {
  it("lists rooms with layouts and summarises assets", () => {
    const room = roomDetail()
    const layout = layoutDetail()
    const text = overview(
      [
        {
          room: {
            _id: room._id,
            name: room.name,
            corners: room.shell.corners,
            featureCount: room.features.length,
          },
          layouts: [
            {
              _id: layout._id,
              _creationTime: NOW,
              roomId: room._id,
              name: "Starter",
              status: "candidate",
              revision: 3,
              lintCounts: layout.lint.counts,
              updatedAt: NOW,
              placementCount: 3,
              price: layout.price,
            },
          ],
        },
      ],
      [assetSummary(), assetSummary(TABLE_ID)]
    )
    expect(text).toContain("Roomer: 1 room, 2 assets.")
    expect(text).toContain(
      `id ${layout._id} · candidate · rev 3 · 3 items · £369 (+2 unpriced) · lint 1 error, 1 warning, 1 info`
    )
    expect(text).toContain("Assets: 2 (2 library, 0 custom) — sofa 1, table 1.")
  })

  it("points at create_room and create_asset when empty", () => {
    const text = overview([], [])
    expect(text).toContain("No rooms yet — create one with create_room.")
    expect(text).toContain("build one with create_asset")
  })
})

describe("assets", () => {
  it("lists one asset per line with key, size, price and id", () => {
    const text = assetList([assetSummary(TABLE_ID)], { total: 5 })
    expect(text).toContain("(showing 1 of 5; raise limit to see more)")
    expect(text).toContain(
      `- generic-coffee-table · "Generic coffee table" · table, floor · 1,100W × 600D × 420H mm · £369 · library · 1 photo, 0 previews · id ${TABLE_ID}`
    )
    expect(assetList([])).toMatch(/^No assets match/)
  })

  it("lists clearance zones with their rectangles", () => {
    const text = assetDetailText({
      ...assetDetail(SOFA_ID),
      clearanceZones: [{ name: "legroom", rect: [-497, 85, 1548, 535] }],
    })
    expect(text).toContain(
      "Clearance zones (replace the clearance above for lint; [minX, minZ, maxX, maxZ] item-local mm): legroom [-497, 85, 1,548, 535]"
    )
  })

  it("shows half-millimetre bounds as sent", () => {
    expect(
      boundsLine(
        { min: [-1145, -0.5, -1370], max: [1145, 4.5, 1370] },
        { w: 2290, d: 2740, h: 5 }
      )
    ).toBe(
      "Parts' bounding box: 2,290W × 2,740D × 5H mm — x -1,145…1,145, y -0.5…4.5, z -1,370…1,370; matches the listed dims."
    )
  })

  it("details an asset and offers the parts JSON", () => {
    const asset = {
      ...assetDetail(TABLE_ID),
      clearance: { right: 100, front: 400 },
    }
    const text = assetDetailText(asset)
    expect(text).toContain("Clearance: front 400mm, right 100mm")
    expect(text).toContain("Size: 1,100W × 600D × 420H mm (dims from listing)")
    expect(text).toContain("Model: 5 parts — top (box), leg front left (box)")
    expect(text).toContain("Pass includeParts: true")
    expect(text).toContain(
      "1. [primary] http://127.0.0.1:3210/api/storage/table"
    )
    expect(text).toContain("Previews: none — preview_asset renders them.")
    const withParts = assetDetailText(asset, { includeParts: true })
    expect(withParts).toContain('Parts JSON:\n[{"shape":"box","name":"top"')
  })

  it("compares the parts' bounding box with the listed dims", () => {
    const listed = { w: 1200, d: 600, h: 313 }
    expect(
      boundsLine({ min: [-600, 0, -300], max: [600, 313, 300] }, listed)
    ).toContain("matches the listed dims")
    expect(
      boundsLine({ min: [-600, 0, -300], max: [600, 320, 300] }, listed)
    ).toContain("differs in h")
  })
})

describe("layouts", () => {
  it("shows each item with its asset, position and wall relation, then lint", () => {
    const text = layoutDetailText(layoutDetail(), "Living room")
    expect(text).toContain('Layout "Starter"')
    expect(text).toContain('room "Living room"')
    expect(text).toContain(
      "- sofa: Generic sofa [generic-sofa] 2,200W × 950D × 820H mm"
    )
    expect(text).toMatch(/at \(493, 3,700\) · back against W6/)
    expect(text).toMatch(/facing 90° \(into the room\)/)
    expect(text).toContain('- rug: "Living rug" Generic rug')
    expect(text.indexOf("Lint:")).toBeGreaterThan(text.indexOf("- rug"))
  })

  it("falls back to the bearing when there is no wall relation", () => {
    const layout = { ...layoutDetail(), relations: {} }
    const elevated = {
      ...layout.placements[0]!,
      elevation: 400,
      mirrored: true,
    }
    expect(placementLine(elevated, layout)).toContain(
      "at (493, 3,700) facing 90° (right) · bottom 400mm up · mirrored"
    )
  })

  it("invites the first apply_changes on an empty layout", () => {
    expect(layoutDetailText(layoutDetail({ placements: [] }))).toContain(
      "Items: none yet"
    )
  })

  it("summarises applied changes with the new revision", () => {
    expect(changeList([{ summary: "Added sofa" }], 4)).toBe(
      "Applied 1 change → revision 4.\n- Added sofa"
    )
  })
})

describe("renders", () => {
  it("maps id-pass colours to items with their share of the frame", () => {
    const text = idLegend(
      [
        {
          placementId: "sofa",
          assetId: "a",
          label: "sofa",
          assetName: "Generic sofa",
          colorName: "red",
          hex: "#e6194b",
        },
        {
          placementId: "rug",
          assetId: "b",
          label: "Generic rug",
          assetName: "Generic rug",
          colorName: "green",
          hex: "#3cb44b",
        },
      ],
      { sofa: 0.184, rug: 0 }
    )
    expect(text).toContain("- red #e6194b: sofa — sofa (Generic sofa) — 18.4%")
    expect(text).toContain(
      "- green #3cb44b: rug — Generic rug — not visible from here"
    )
  })

  it("flags renders of an older revision and explains failures", () => {
    const done = renderList([renderRecord()], 5)
    expect(done).toContain("photoreal · stub (low) · done")
    expect(done).toContain("rev 3 (layout is now at 5)")
    expect(done).toContain("4s")
    const failed = renderList(
      [
        renderRecord({
          status: "failed",
          error: "rate limited",
          output: undefined,
          outputUrl: null,
        }),
      ],
      3
    )
    expect(failed).toContain("failed: rate limited")
    expect(failed).toContain("rev 3 ·")
    expect(renderList([])).toMatch(/^No renders yet/)
  })
})
