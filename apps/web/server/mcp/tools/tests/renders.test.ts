import { describe, expect, it } from "vitest"

import { PhotorealError } from "../../../photoreal/errors"
import {
  fakeDeps,
  imagesOf,
  LAYOUT_ID,
  RENDER_ID,
  roomSpec,
  layoutDetail,
  storageId,
  textOf,
} from "../../tests/fakes"
import { listRenders, photorealText, renderPhotoreal } from "../renders"

describe("render_photoreal", () => {
  it("runs the pipeline, stores the result and returns the image", async () => {
    const deps = fakeDeps()
    const camera = roomSpec().cameras[0]!
    const result = await renderPhotoreal.call(
      {
        layoutId: LAYOUT_ID,
        camera: camera.id,
        model: "stub",
        quality: "low",
        size: { width: 600, height: 400 },
      },
      deps
    )
    expect(result.isError).toBeUndefined()
    expect(imagesOf(result)).toBe(1)
    expect(deps.photoreal.renderer).toHaveBeenCalledWith("stub")
    expect(deps.api.renders.create).toHaveBeenCalledWith({
      layoutId: LAYOUT_ID,
      kind: "photoreal",
      view: camera,
      model: "stub",
      quality: "low",
    })
    expect(deps.api.renders.complete).toHaveBeenCalledWith(
      expect.objectContaining({ renderId: RENDER_ID, output: storageId(3) })
    )
    const text = textOf(result)
    expect(text).toMatch(
      new RegExp(
        `^Photoreal render ${RENDER_ID} done in \\d+s \\(model stub, low quality, 600×400 requested`
      )
    )
    expect(text).toContain("free stub renderer")
    expect(result.structuredContent).toMatchObject({
      renderId: RENDER_ID,
      model: "stub",
    })
  })

  it("defaults to the precise model at medium quality", async () => {
    const deps = fakeDeps()
    await renderPhotoreal.call(
      {
        layoutId: LAYOUT_ID,
        camera: { position: [500, 1500, 500], target: [2000, 1200, 5000] },
      },
      deps
    )
    expect(deps.photoreal.renderer).toHaveBeenCalledWith(
      "openai/gpt-image-2.5-sunburst"
    )
    expect(deps.api.renders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quality: "medium",
        view: expect.objectContaining({ id: "inline" }),
      })
    )
  })

  it("names the product photos it sent", async () => {
    const deps = fakeDeps()
    // The fake id pass shows the first item (the sofa); give it the photo.
    deps.api.layouts.get.mockImplementationOnce(async () => {
      const layout = layoutDetail()
      const sofaId = layout.placements[0]!.assetId
      layout.assets[sofaId] = {
        ...layout.assets[sofaId]!,
        primaryImageUrl: "http://127.0.0.1:3210/api/storage/sofa",
      }
      return layout
    })
    const result = await renderPhotoreal.call(
      { layoutId: LAYOUT_ID, camera: roomSpec().cameras[0]!.id, model: "stub" },
      deps
    )
    expect(textOf(result)).toContain(
      "Product photos sent: Generic sofa (sofa; 50% of frame)"
    )
    expect(textOf(result)).toContain(
      "Skipped: Generic coffee table (not visible)"
    )
    expect(deps.api.files.download).toHaveBeenCalledWith(
      "http://127.0.0.1:3210/api/storage/sofa"
    )
  })

  it("refuses top and orbit views without creating a record", async () => {
    const deps = fakeDeps()
    const result = await renderPhotoreal.call(
      { layoutId: LAYOUT_ID, camera: "top" },
      deps
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(
      "Photoreal renders need a perspective camera"
    )
    expect(deps.api.renders.create).not.toHaveBeenCalled()
  })

  it("fails fast without a record when the model can't run", async () => {
    const deps = fakeDeps()
    deps.photoreal.renderer.mockImplementationOnce(() => {
      throw new PhotorealError("AUTH", "AI_GATEWAY_API_KEY is not set.")
    })
    const result = await renderPhotoreal.call(
      { layoutId: LAYOUT_ID, camera: roomSpec().cameras[0]!.id },
      deps
    )
    expect(textOf(result)).toBe(
      "Error PHOTOREAL_AUTH: AI_GATEWAY_API_KEY is not set."
    )
    expect(deps.api.renders.create).not.toHaveBeenCalled()
  })

  it("marks the record failed when the model errors", async () => {
    const deps = fakeDeps()
    deps.imageRenderer.render.mockRejectedValueOnce(
      new PhotorealError(
        "RATE_LIMIT",
        "openai/gpt-image-2.5-sunburst is rate limited right now."
      )
    )
    const result = await renderPhotoreal.call(
      { layoutId: LAYOUT_ID, camera: roomSpec().cameras[0]!.id },
      deps
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("PHOTOREAL_RATE_LIMIT")
    expect(deps.api.renders.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        renderId: RENDER_ID,
        error: "openai/gpt-image-2.5-sunburst is rate limited right now.",
      })
    )
    expect(deps.api.renders.complete).not.toHaveBeenCalled()
  })
})

describe("photorealText", () => {
  it("mentions room photos and why a product photo was skipped", () => {
    const text = photorealText(
      {
        renderId: RENDER_ID,
        png: Buffer.from(""),
        model: "openai/gpt-image-2.5-flare",
        quality: "low",
        durationMs: 20_000,
        modelDurationMs: 18_000,
        references: [],
        skipped: [
          {
            assetId: "a",
            assetName: "Mori Coffee Table",
            placementIds: ["coffee-table"],
            visibleFraction: 0.02,
            reason: "load-failed",
            detail: "image/avif isn't accepted by the image models",
          },
        ],
        roomPhotos: { sent: 2, failed: 1 },
        outputUrl: null,
        layoutRevision: 4,
      },
      { width: 1536, height: 1024 }
    )
    expect(text).toContain("No product photos were sent")
    expect(text).toContain(
      "Skipped: Mori Coffee Table (photo failed to load: image/avif isn't accepted by the image models)."
    )
    expect(text).toContain("Room photos sent: 2 (1 failed to load).")
    expect(text).not.toContain("stub")
  })
})

describe("list_renders", () => {
  it("lists renders against the layout's current revision", async () => {
    const deps = fakeDeps()
    const text = textOf(await listRenders.call({ layoutId: LAYOUT_ID }, deps))
    expect(deps.api.renders.listByLayout).toHaveBeenCalledWith({
      layoutId: LAYOUT_ID,
      limit: 20,
    })
    expect(text).toMatch(
      /^Layout "Starter" \(revision 3\)\.\nRenders \(1, newest first\):/
    )
    expect(text).toContain(`- ${RENDER_ID} · photoreal · stub (low) · done`)
  })
})
