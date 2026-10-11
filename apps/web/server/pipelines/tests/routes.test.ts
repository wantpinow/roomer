import { ConvexError } from "convex/values"
import { describe, expect, it, vi } from "vitest"

import { PhotorealError } from "../../photoreal/errors"
import {
  assetDetail,
  fakeDeps,
  LAYOUT_ID,
  RENDER_ID,
  roomSpec,
  SOFA_ID,
} from "../../mcp/tests/fakes"
import {
  assetPreviewsRoute,
  errorResponse,
  planSvgRoute,
  startRenderRoute,
} from "../routes"

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("errorResponse", () => {
  it.each([
    [new ConvexError({ code: "NOT_FOUND", message: "Gone." }), 404],
    [new ConvexError({ code: "CONFLICT", message: "Changed." }), 409],
    [new PhotorealError("AUTH", "No key."), 503],
    [new PhotorealError("RATE_LIMIT", "Slow."), 429],
  ])("maps %s to %i", async (error, status) => {
    const response = errorResponse(error)
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ error: expect.any(String) })
  })

  it("logs and 500s anything unexpected", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(errorResponse(new Error("boom")).status).toBe(500)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})

describe("startRenderRoute", () => {
  it("answers 202 with the render id and schedules the rest", async () => {
    const deps = fakeDeps()
    const tasks: (() => Promise<void>)[] = []
    const response = await startRenderRoute(
      deps,
      LAYOUT_ID,
      post({
        camera: roomSpec().cameras[0]!.id,
        model: "stub",
        quality: "low",
      }),
      (task) => tasks.push(task)
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      renderId: RENDER_ID,
      model: "stub",
      layoutRevision: 3,
    })
    expect(tasks).toHaveLength(1)
    await tasks[0]!()
    expect(deps.api.renders.complete).toHaveBeenCalled()
  })

  it("keeps a failed render out of the response and logs it", async () => {
    const deps = fakeDeps()
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    deps.imageRenderer.render.mockRejectedValueOnce(new Error("model exploded"))
    const tasks: (() => Promise<void>)[] = []
    const response = await startRenderRoute(
      deps,
      LAYOUT_ID,
      post({ camera: roomSpec().cameras[0]!.id }),
      (task) => tasks.push(task)
    )
    expect(response.status).toBe(202)
    await expect(tasks[0]!()).resolves.toBeUndefined()
    expect(deps.api.renders.fail).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      `[photoreal] render ${RENDER_ID} failed:`,
      "model exploded"
    )
    log.mockRestore()
  })

  it("rejects a bad body with 400 and a missing camera field", async () => {
    const deps = fakeDeps()
    const invalid = await startRenderRoute(
      deps,
      LAYOUT_ID,
      post("{"),
      () => undefined
    )
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({
      error: "The request body isn't valid JSON.",
    })
    const missing = await startRenderRoute(
      deps,
      LAYOUT_ID,
      post({}),
      () => undefined
    )
    expect(missing.status).toBe(400)
    expect(deps.api.renders.create).not.toHaveBeenCalled()
  })
})

describe("planSvgRoute", () => {
  it("serves the layout's plan as SVG", async () => {
    const response = await planSvgRoute(
      fakeDeps(),
      LAYOUT_ID,
      new URL("http://localhost/x?highlight=sofa,%20rug")
    )
    expect(response.headers.get("content-type")).toBe(
      "image/svg+xml; charset=utf-8"
    )
    expect(await response.text()).toMatch(/^<svg/)
  })

  it("404s an unknown layout", async () => {
    const deps = fakeDeps()
    deps.api.layouts.get.mockResolvedValueOnce(null)
    const response = await planSvgRoute(
      deps,
      "nope",
      new URL("http://localhost/x")
    )
    expect(response.status).toBe(404)
  })
})

describe("assetPreviewsRoute", () => {
  it("re-renders the asked views", async () => {
    const deps = fakeDeps()
    const response = await assetPreviewsRoute(
      deps,
      SOFA_ID,
      post({ views: ["iso"] })
    )
    expect(await response.json()).toEqual({ views: ["iso"] })
    expect(deps.api.assets.setPreviews).toHaveBeenCalled()
  })

  it("defaults to all views for an empty body and 404s a missing asset", async () => {
    const deps = fakeDeps()
    deps.api.assets.get.mockResolvedValueOnce(assetDetail(SOFA_ID))
    const all = await assetPreviewsRoute(deps, SOFA_ID, post(""))
    expect(await all.json()).toEqual({ views: ["front", "side", "top", "iso"] })
    deps.api.assets.get.mockResolvedValueOnce(null)
    expect((await assetPreviewsRoute(deps, "nope", post(""))).status).toBe(404)
  })
})
