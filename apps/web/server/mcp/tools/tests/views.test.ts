import { describe, expect, it } from "vitest"

import {
  fakeDeps,
  imagesOf,
  LAYOUT_ID,
  ROOM_ID,
  roomSpec,
  textOf,
} from "../../tests/fakes"
import { renderPlanTool, renderView } from "../views"

describe("render_plan", () => {
  it("draws a layout's plan as one PNG", async () => {
    const deps = fakeDeps()
    const result = await renderPlanTool.call(
      { layoutId: LAYOUT_ID, highlight: ["sofa"] },
      deps
    )
    expect(result.isError).toBeUndefined()
    expect(imagesOf(result)).toBe(1)
    expect(textOf(result)).toMatch(
      /^Floor plan of layout "Starter" \(revision 3, 3 items\) in room "Living room"/
    )
  })

  it("draws a bare room and adds the SVG on request", async () => {
    const deps = fakeDeps()
    const result = await renderPlanTool.call(
      { roomId: ROOM_ID, svg: true },
      deps
    )
    expect(textOf(result)).toContain('Floor plan of room "Living room"')
    expect(textOf(result)).toContain("SVG:\n<svg")
    expect(result.structuredContent).toMatchObject({ roomId: ROOM_ID })
    expect(deps.api.layouts.get).not.toHaveBeenCalled()
  })

  it("needs exactly one of layoutId and roomId", async () => {
    const both = await renderPlanTool.call(
      { layoutId: LAYOUT_ID, roomId: ROOM_ID },
      fakeDeps()
    )
    expect(both.isError).toBe(true)
    expect(textOf(both)).toContain("Give exactly one of layoutId")
    const neither = await renderPlanTool.call({}, fakeDeps())
    expect(neither.isError).toBe(true)
  })
})

describe("render_view", () => {
  it("renders the clay pass from a saved camera at the default size", async () => {
    const deps = fakeDeps()
    const camera = roomSpec().cameras[0]!
    const result = await renderView.call(
      { layoutId: LAYOUT_ID, camera: camera.id },
      deps
    )
    expect(imagesOf(result)).toBe(1)
    const scene = deps.renderer.renderScene.mock.calls[0]![0]
    expect(scene).toMatchObject({
      pass: "clay",
      width: 1280,
      height: 853,
      view: { kind: "camera", camera: { id: camera.id } },
    })
    expect(scene.placements).toHaveLength(3)
    expect(Object.keys(scene.assets)).toHaveLength(3)
    expect(scene.room.finishes?.walls).toBe(roomSpec().finishes.walls)
    expect(textOf(result)).toContain(
      `Clay render of "Starter" (revision 3) from the camera ${camera.id}`
    )
  })

  it("adds the id pass with its colour legend", async () => {
    const deps = fakeDeps()
    const result = await renderView.call(
      {
        layoutId: LAYOUT_ID,
        camera: "orbit",
        orbit: { azimuth: 135 },
        pass: "both",
        width: 400,
        height: 300,
      },
      deps
    )
    expect(imagesOf(result)).toBe(2)
    expect(deps.renderer.renderScene.mock.calls.map((c) => c[0].pass)).toEqual([
      "clay",
      "id",
    ])
    expect(deps.renderer.renderScene.mock.calls[0]![0].view).toEqual({
      kind: "orbit",
      azimuth: 135,
    })
    const text = textOf(result)
    expect(text).toContain("- red #e6194b: sofa — Generic sofa — 50.0%")
    expect(text).toContain(
      "- green #3cb44b: coffee-table — Generic coffee table — not visible from here"
    )
    expect(result.structuredContent).toMatchObject({
      visibleShare: { sofa: 0.5 },
    })
  })

  it("takes an inline camera and the top view", async () => {
    const deps = fakeDeps()
    await renderView.call(
      {
        layoutId: LAYOUT_ID,
        camera: { position: [500, 1500, 500], target: [2000, 1000, 4000] },
      },
      deps
    )
    expect(deps.renderer.renderScene.mock.calls[0]![0].view).toMatchObject({
      kind: "camera",
      camera: { id: "inline", fov: 70 },
    })
    await renderView.call({ layoutId: LAYOUT_ID, camera: "top" }, deps)
    expect(deps.renderer.renderScene.mock.calls[1]![0].view).toEqual({
      kind: "top",
    })
  })

  it("lists the saved cameras when the camera is unknown", async () => {
    const result = await renderView.call(
      { layoutId: LAYOUT_ID, camera: "balcony" },
      fakeDeps()
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(
      /^Error NOT_FOUND: The room has no camera 'balcony'\. Saved cameras: .+; or use "top", "orbit"/
    )
  })

  it("reports a renderer failure as a tool error", async () => {
    const deps = fakeDeps()
    deps.renderer.renderScene.mockRejectedValueOnce(
      new Error("clay render timed out after 60000 ms")
    )
    const result = await renderView.call(
      { layoutId: LAYOUT_ID, camera: "top" },
      deps
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("clay render timed out")
  })
})
