import { PNG } from "pngjs"
import { describe, expect, it } from "vitest"

import { hexToRgb, idPassColor } from "@/lib/scene/id-pass"

import {
  fakeDeps,
  layoutDetail,
  roomDetail,
  solidPng,
} from "../../mcp/tests/fakes"
import {
  buildRenderScene,
  idPassVisibility,
  inlineCamera,
  mergedFinishes,
  renderLayoutView,
  resolveView,
  sceneAssets,
  sceneLegend,
} from "../views"

const room = roomDetail()

describe("resolveView", () => {
  it("resolves saved cameras, top, orbit and inline cameras", () => {
    const saved = room.cameras[0]!
    expect(resolveView(room.cameras, saved.id)).toEqual({
      view: { kind: "camera", camera: saved },
      camera: saved,
      label: `camera ${saved.id}`,
    })
    expect(resolveView(room.cameras, "top")).toEqual({
      view: { kind: "top" },
      label: "top view",
    })
    expect(resolveView(room.cameras, "orbit", { elevation: 30 }).view).toEqual({
      kind: "orbit",
      elevation: 30,
    })
    const inline = resolveView(room.cameras, {
      position: [0, 1500, 0],
      target: [1000, 1500, 1000],
      projection: "fisheye",
    })
    expect(inline.camera).toEqual({
      id: "inline",
      name: "Inline camera",
      position: [0, 1500, 0],
      target: [1000, 1500, 1000],
      fov: 70,
      projection: "fisheye",
    })
  })

  it("names the saved cameras when the id is unknown", () => {
    expect(() => resolveView([], "nope")).toThrow(
      "The room has no camera 'nope'. Saved cameras: none;"
    )
  })

  it("keeps an inline camera's fov", () => {
    expect(
      inlineCamera({ position: [0, 0, 0], target: [1, 0, 0], fov: 40 }).fov
    ).toBe(40)
  })
})

describe("scenes", () => {
  it("lets the layout's finishes override the room's field by field", () => {
    expect(
      mergedFinishes({ walls: "white", floor: "oak" }, { walls: "sage" })
    ).toEqual({
      walls: "sage",
      floor: "oak",
    })
    expect(mergedFinishes({ walls: "white" }, undefined)).toEqual({
      walls: "white",
    })
  })

  it("strips Convex fields from assets", () => {
    const assets = sceneAssets(layoutDetail())
    const spec = Object.values(assets)[0]!
    expect(spec).not.toHaveProperty("_id")
    expect(spec).not.toHaveProperty("primaryImageUrl")
    expect(spec.geometry.parts.length).toBeGreaterThan(0)
  })

  it("builds an empty-room scene without a layout", () => {
    const scene = buildRenderScene(
      { room, view: { kind: "top" }, width: 100, height: 80 },
      "clay"
    )
    expect(scene).toMatchObject({
      placements: [],
      assets: {},
      pass: "clay",
      width: 100,
    })
    expect(scene.room.corners).toEqual(room.shell.corners)
  })

  it("renders each pass in order", async () => {
    const deps = fakeDeps()
    const out = await renderLayoutView(
      deps,
      {
        room,
        layout: layoutDetail(),
        view: { kind: "top" },
        width: 20,
        height: 10,
      },
      ["clay", "id"]
    )
    expect(out.map((o) => o.pass)).toEqual(["clay", "id"])
  })
})

/** A PNG with given colours painted over given numbers of pixels. */
function paint(
  width: number,
  height: number,
  runs: [string, number][]
): Buffer {
  const png = PNG.sync.read(solidPng(width, height, [217, 217, 217]))
  let pixel = 0
  for (const [hex, count] of runs) {
    const [r, g, b] = hexToRgb(hex)
    for (let i = 0; i < count; i++, pixel++) {
      png.data[pixel * 4] = r
      png.data[pixel * 4 + 1] = g
      png.data[pixel * 4 + 2] = b
    }
  }
  return PNG.sync.write(png)
}

describe("idPassVisibility", () => {
  it("counts each placement's colour as a share of the frame", () => {
    const legend = sceneLegend(layoutDetail())
    const png = paint(10, 10, [
      [idPassColor(0).hex, 30],
      [idPassColor(2).hex, 5],
    ])
    const visibility = idPassVisibility(png, legend)
    expect(visibility.totalPixels).toBe(100)
    expect(visibility.byPlacement).toEqual({
      sofa: 30,
      "coffee-table": 0,
      rug: 5,
    })
    expect(visibility.shares).toEqual({
      sofa: 0.3,
      "coffee-table": 0,
      rug: 0.05,
    })
  })

  it("splits a repeated colour evenly between the placements sharing it", () => {
    const hex = idPassColor(0).hex
    const legend = [
      { placementId: "a", assetId: "x", label: "a", colorName: "red", hex },
      { placementId: "b", assetId: "x", label: "b", colorName: "red", hex },
    ]
    const visibility = idPassVisibility(paint(10, 10, [[hex, 40]]), legend)
    expect(visibility.byPlacement).toEqual({ a: 20, b: 20 })
  })
})
