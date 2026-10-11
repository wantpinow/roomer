import { describe, expect, it, vi } from "vitest"

import { PhotorealError } from "../../photoreal/errors"
import {
  fakeDeps,
  LAYOUT_ID,
  layoutDetail,
  RENDER_ID,
  roomDetail,
  roomSpec,
  solidPng,
  storageId,
  TABLE_ID,
} from "../../mcp/tests/fakes"
import { startPhotoreal } from "../photoreal"

const camera = roomSpec().cameras[0]!

/** The coffee table (with a photo) as the only visible placement. */
function tableFirstLayout() {
  const layout = layoutDetail()
  const table = layout.placements.find((p) => p.assetId === TABLE_ID)!
  return {
    ...layout,
    placements: [table, ...layout.placements.filter((p) => p !== table)],
  }
}

describe("startPhotoreal", () => {
  it("returns the render id before the work is done", async () => {
    const deps = fakeDeps()
    let release!: () => void
    deps.imageRenderer.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ png: Buffer.from("png") })
        })
    )
    const started = await startPhotoreal(deps, {
      layoutId: LAYOUT_ID,
      camera: camera.id,
    })
    expect(started).toMatchObject({
      renderId: RENDER_ID,
      model: "stub",
      camera,
      layoutRevision: 3,
    })
    expect(deps.api.renders.complete).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(deps.imageRenderer.render).toHaveBeenCalled())
    release()
    await started.finished
    expect(deps.api.renders.complete).toHaveBeenCalled()
  })

  it("sends the passes and product photos and records every input", async () => {
    const deps = fakeDeps()
    deps.api.layouts.get.mockResolvedValueOnce(tableFirstLayout())
    const started = await startPhotoreal(deps, {
      layoutId: LAYOUT_ID,
      camera: camera.id,
      quality: "low",
      size: { width: 300, height: 200 },
      extraPrompt: "late afternoon light",
    })
    const outcome = await started.finished

    const scenes = deps.renderer.renderScene.mock.calls.map((c) => c[0])
    expect(scenes.map((s) => [s.pass, s.width, s.height])).toEqual([
      ["clay", 300, 200],
      ["id", 300, 200],
    ])
    const request = deps.imageRenderer.render.mock.calls[0]![0]
    expect(request.images.map((i) => i.role)).toEqual([
      "clay",
      "id",
      "reference",
    ])
    expect(request.quality).toBe("low")
    expect(request.prompt).toContain("late afternoon light")
    expect(request.prompt).toContain("Generic coffee table")

    expect(deps.api.renders.complete).toHaveBeenCalledWith({
      renderId: RENDER_ID,
      output: storageId(3),
      inputs: [
        { role: "clay", storageId: storageId(1) },
        { role: "id", storageId: storageId(2) },
        {
          role: "reference",
          storageId: storageId(900),
          placementId: "coffee-table",
        },
      ],
      prompt: request.prompt,
      durationMs: expect.any(Number),
    })
    expect(outcome.references).toEqual([
      {
        assetId: TABLE_ID,
        assetName: "Generic coffee table",
        placementIds: ["coffee-table"],
        visibleFraction: 0.5,
      },
    ])
    expect(outcome.skipped.map((s) => s.reason)).toEqual([
      "not-visible",
      "not-visible",
    ])
    expect(outcome.outputUrl).toBe("http://127.0.0.1:3210/api/storage/out")
    expect(outcome.quality).toBe("low")
  })

  it("sends the room's reference photos and counts the ones that fail", async () => {
    const deps = fakeDeps()
    deps.api.rooms.get.mockResolvedValueOnce({
      ...roomDetail(),
      referencePhotoUrls: [
        {
          storageId: storageId(70),
          url: "http://127.0.0.1:3210/api/storage/r1",
        },
        {
          storageId: storageId(71),
          url: "http://127.0.0.1:3210/api/storage/r2",
        },
        { storageId: storageId(72), url: null },
      ],
    })
    deps.api.files.download.mockImplementation(async (url) =>
      url.endsWith("r2")
        ? { data: Buffer.from("GIF89a"), mime: "image/gif" }
        : { data: solidPng(4, 4), mime: "image/png" }
    )
    const outcome = await (
      await startPhotoreal(deps, { layoutId: LAYOUT_ID, camera: camera.id })
    ).finished
    expect(outcome.roomPhotos).toEqual({ sent: 1, failed: 1 })
    const request = deps.imageRenderer.render.mock.calls[0]![0]
    expect(request.images.map((i) => i.role)).toEqual(["clay", "id", "room"])
  })

  it("skips a product photo in a format the models refuse, saying why", async () => {
    const deps = fakeDeps()
    deps.api.layouts.get.mockResolvedValueOnce(tableFirstLayout())
    deps.api.files.download.mockResolvedValueOnce({
      data: Buffer.from("....ftypavif"),
      mime: "image/avif",
    })
    const outcome = await (
      await startPhotoreal(deps, { layoutId: LAYOUT_ID, camera: camera.id })
    ).finished
    expect(outcome.references).toEqual([])
    expect(outcome.skipped.find((s) => s.assetId === TABLE_ID)).toMatchObject({
      reason: "load-failed",
      detail: expect.stringContaining(
        "image/avif isn't accepted by the image models"
      ),
    })
    const request = deps.imageRenderer.render.mock.calls[0]![0]
    expect(request.images.map((i) => i.role)).toEqual(["clay", "id"])
  })

  it("marks the render failed and rethrows when a step fails", async () => {
    const deps = fakeDeps()
    deps.renderer.renderScene.mockRejectedValueOnce(
      new Error("id render timed out")
    )
    const started = await startPhotoreal(deps, {
      layoutId: LAYOUT_ID,
      camera: camera.id,
    })
    await expect(started.finished).rejects.toThrow("id render timed out")
    expect(deps.api.renders.fail).toHaveBeenCalledWith({
      renderId: RENDER_ID,
      error: "id render timed out",
      durationMs: expect.any(Number),
    })
  })

  it("still rethrows the original error if recording the failure fails", async () => {
    const deps = fakeDeps()
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    deps.imageRenderer.render.mockRejectedValueOnce(
      new PhotorealError("UPSTREAM", "502")
    )
    deps.api.renders.fail.mockRejectedValueOnce(new Error("convex down"))
    const started = await startPhotoreal(deps, {
      layoutId: LAYOUT_ID,
      camera: camera.id,
    })
    await expect(started.finished).rejects.toThrow("502")
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`could not mark render ${RENDER_ID} failed`),
      "convex down"
    )
    log.mockRestore()
  })

  it("refuses a missing layout before doing anything", async () => {
    const deps = fakeDeps()
    deps.api.layouts.get.mockResolvedValueOnce(null)
    await expect(
      startPhotoreal(deps, { layoutId: LAYOUT_ID, camera: camera.id })
    ).rejects.toThrow(`There's no layout with id ${LAYOUT_ID}.`)
    expect(deps.photoreal.renderer).not.toHaveBeenCalled()
  })
})
