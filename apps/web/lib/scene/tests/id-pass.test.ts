import { ID_PASS_PALETTE, ID_PASS_SHELL, TEST_ASSETS } from "@roomer/core"
import { describe, expect, it } from "vitest"

import { FIXTURE_ASSETS, FIXTURE_PLACEMENTS } from "../fixture-scene"
import { hexToRgb, idPassColor, idPassLegend } from "../id-pass"
import {
  ID_PASS_BACKGROUND,
  ID_PASS_NON_ITEM_COLORS,
  idPassShellColor,
} from "../palette"

describe("idPassColor", () => {
  it("takes palette entries in placement order", () => {
    expect(idPassColor(0)).toEqual({ name: "red", hex: "#e6194b" })
    expect(idPassColor(3)).toEqual({ name: "blue", hex: "#4363d8" })
  })

  it("wraps around after the palette", () => {
    expect(idPassColor(ID_PASS_PALETTE.length)).toEqual(idPassColor(0))
    expect(idPassColor(ID_PASS_PALETTE.length + 5)).toEqual(idPassColor(5))
  })
})

describe("idPassLegend", () => {
  it("lists every placement with its colour and a readable label", () => {
    const legend = idPassLegend(FIXTURE_PLACEMENTS, FIXTURE_ASSETS)
    expect(legend).toHaveLength(FIXTURE_PLACEMENTS.length)
    expect(legend[0]).toEqual({
      placementId: "sofa",
      assetId: "test-sofa",
      label: TEST_ASSETS.sofa.name,
      assetName: TEST_ASSETS.sofa.name,
      colorName: "red",
      hex: "#e6194b",
    })
    expect(new Set(legend.map((e) => e.hex)).size).toBe(legend.length)
  })

  it("prefers the placement label and survives a missing asset", () => {
    const [entry] = idPassLegend(
      [
        {
          id: "lamp",
          assetId: "gone",
          label: "Reading lamp",
          x: 0,
          z: 0,
          facing: 0,
          elevation: 0,
        },
      ],
      {}
    )
    expect(entry).toEqual({
      placementId: "lamp",
      assetId: "gone",
      label: "Reading lamp",
      colorName: "red",
      hex: "#e6194b",
    })
    const [bare] = idPassLegend(
      [{ id: "lamp", assetId: "gone", x: 0, z: 0, facing: 0, elevation: 0 }],
      {}
    )
    expect(bare!.label).toBe("lamp")
  })
})

describe("hexToRgb", () => {
  it("parses #rrggbb", () => {
    expect(hexToRgb("#e6194b")).toEqual([230, 25, 75])
    expect(hexToRgb("FFFFFF")).toEqual([255, 255, 255])
  })

  it("rejects anything else", () => {
    expect(() => hexToRgb("#fff")).toThrow("Not a #rrggbb colour")
  })
})

describe("id pass shell colours", () => {
  it("never collide with an item colour", () => {
    const items = new Set<string>(ID_PASS_PALETTE.map((c) => c.hex))
    for (const hex of ID_PASS_NON_ITEM_COLORS)
      expect(items.has(hex)).toBe(false)
  })

  it("map shell roles onto core's shell palette", () => {
    expect(idPassShellColor("wall")).toBe(ID_PASS_SHELL.walls)
    expect(idPassShellColor("floor")).toBe(ID_PASS_SHELL.floor)
    expect(idPassShellColor("glass")).toBe(ID_PASS_SHELL.openings)
    expect(idPassShellColor("radiator")).toBe(ID_PASS_SHELL.fixtures)
    expect(idPassShellColor("beam")).toBe(ID_PASS_SHELL.ceiling)
    expect(ID_PASS_NON_ITEM_COLORS).toContain(ID_PASS_BACKGROUND)
  })
})
