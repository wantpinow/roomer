import type { Camera } from "@roomer/core/schema"
import { describe, expect, it } from "vitest"

import { api } from "../convex/_generated/api"
import { doGenerateUploadUrl, doGetFileUrl } from "../convex/files"
import { doApplyChanges, doUpdateLayout } from "../convex/layouts"
import {
  doCompleteRender,
  doCreateRender,
  doFailRender,
  doGetRender,
  doListRendersByLayout,
  doListRendersByRoom,
  MAX_ERROR_LENGTH,
} from "../convex/renders"
import {
  createLayout,
  createLivingRoom,
  createTestAsset,
  createTestConvex,
  expectAppError,
  fakeStorageId,
} from "./setup"

const VIEW: Camera = {
  id: "from-d1",
  name: "From the hall door",
  position: [1550, 1600, 300],
  target: [1550, 1200, 7690],
  fov: 50,
}

/** The living room with a sofa placed and a finishes override. */
async function world() {
  const t = createTestConvex()
  const roomId = await createLivingRoom(t)
  await createTestAsset(t, "sofa")
  const layoutId = await createLayout(t, roomId)
  await t.run(async (ctx) =>
    doApplyChanges(ctx, {
      layoutId,
      actor: "agent",
      ops: [
        {
          op: "add",
          id: "sofa",
          asset: "test-sofa",
          position: { mode: "against", wall: "W6", at: 3700 },
        },
      ],
    })
  )
  await t.run(async (ctx) =>
    doUpdateLayout(ctx, { layoutId, finishes: { walls: "sage" } })
  )
  return { t, roomId, layoutId }
}

describe("doCreateRender", () => {
  it("records a pending render with a snapshot of the layout and camera", async () => {
    const { t, roomId, layoutId } = await world()
    const clay = await fakeStorageId(t, "clay")
    const { renderId, layoutRevision } = await t.run(async (ctx) =>
      doCreateRender(ctx, {
        layoutId,
        kind: "photoreal",
        view: VIEW,
        model: "stub",
        quality: "low",
        inputs: [{ role: "clay", storageId: clay }],
      })
    )
    expect(layoutRevision).toBe(2)
    const render = await t.run(async (ctx) => ctx.db.get(renderId))
    const layout = await t.run(async (ctx) => ctx.db.get(layoutId))
    expect(render).toMatchObject({
      roomId,
      kind: "photoreal",
      status: "pending",
      view: VIEW,
      model: "stub",
      quality: "low",
      layoutRevision: 2,
      layoutSnapshot: {
        placements: layout?.placements,
        finishes: { walls: "sage" },
      },
    })
    expect(render?.layoutSnapshot.placements).toHaveLength(1)
  })

  it("keeps its snapshot when the layout moves on", async () => {
    const { t, layoutId } = await world()
    const { renderId } = await t.run(async (ctx) =>
      doCreateRender(ctx, { layoutId, kind: "clay", view: VIEW })
    )
    await t.run(async (ctx) =>
      doApplyChanges(ctx, {
        layoutId,
        actor: "agent",
        ops: [{ op: "remove", id: "sofa" }],
      })
    )
    const render = await t.run(async (ctx) => ctx.db.get(renderId))
    expect(render?.layoutSnapshot.placements.map((p) => p.id)).toEqual(["sofa"])
  })

  it("rejects model options on passes, bad cameras and missing files", async () => {
    const { t, layoutId } = await world()
    await expectAppError(
      t.run(async (ctx) =>
        doCreateRender(ctx, {
          layoutId,
          kind: "clay",
          view: VIEW,
          model: "stub",
        })
      ),
      "INVALID_INPUT",
      "model and quality only apply to photoreal renders, not clay passes."
    )
    const bad = await expectAppError(
      t.run(async (ctx) =>
        doCreateRender(ctx, {
          layoutId,
          kind: "clay",
          view: { ...VIEW, fov: 200 },
        })
      ),
      "INVALID_INPUT"
    )
    expect(bad.issues?.map((i) => i.path)).toEqual(["view.fov"])
    const gone = await fakeStorageId(t)
    await t.run(async (ctx) => ctx.storage.delete(gone))
    await expectAppError(
      t.run(async (ctx) =>
        doCreateRender(ctx, {
          layoutId,
          kind: "id",
          view: VIEW,
          inputs: [{ role: "reference", storageId: gone }],
        })
      ),
      "NOT_FOUND"
    )
  })
})

describe("doCompleteRender / doFailRender", () => {
  it("completes a pending render once, with its output and timing", async () => {
    const { t, layoutId } = await world()
    const { renderId } = await t.run(async (ctx) =>
      doCreateRender(ctx, { layoutId, kind: "photoreal", view: VIEW })
    )
    const output = await fakeStorageId(t, "png")
    const reference = await fakeStorageId(t, "photo")
    await t.run(async (ctx) =>
      doCompleteRender(ctx, {
        renderId,
        output,
        prompt: "Keep the camera exactly.",
        inputs: [
          { role: "reference", storageId: reference, placementId: "sofa" },
        ],
        durationMs: 4200,
      })
    )
    const render = await t.run(async (ctx) => doGetRender(ctx, { renderId }))
    expect(render).toMatchObject({
      status: "done",
      output,
      prompt: "Keep the camera exactly.",
      durationMs: 4200,
      outputUrl: expect.stringContaining("/api/storage/"),
      inputUrls: [
        expect.objectContaining({ role: "reference", placementId: "sofa" }),
      ],
    })
    expect(render?.completedAt).toBeTypeOf("number")
    await expectAppError(
      t.run(async (ctx) => doCompleteRender(ctx, { renderId, output })),
      "CONFLICT",
      "already finished"
    )
    await expectAppError(
      t.run(async (ctx) => doFailRender(ctx, { renderId, error: "late" })),
      "CONFLICT"
    )
  })

  it("fails a pending render, keeping the start of a long error", async () => {
    const { t, layoutId } = await world()
    const { renderId } = await t.run(async (ctx) =>
      doCreateRender(ctx, { layoutId, kind: "photoreal", view: VIEW })
    )
    await t.run(async (ctx) =>
      doFailRender(ctx, {
        renderId,
        error: `Gateway timeout ${"x".repeat(5000)}`,
      })
    )
    const render = await t.run(async (ctx) => ctx.db.get(renderId))
    expect(render?.status).toBe("failed")
    expect(render?.error).toHaveLength(MAX_ERROR_LENGTH)
    expect(render?.error).toMatch(/^Gateway timeout/)
  })
})

describe("doListRendersByLayout / doListRendersByRoom", () => {
  it("lists newest first, per layout and per room", async () => {
    const { t, roomId, layoutId } = await world()
    const other = await createLayout(t, roomId, "Other")
    for (const [id, kind] of [
      [layoutId, "clay"],
      [other, "id"],
      [layoutId, "photoreal"],
    ] as const) {
      await t.run(async (ctx) =>
        doCreateRender(ctx, { layoutId: id, kind, view: VIEW })
      )
    }
    const byLayout = await t.run(async (ctx) =>
      doListRendersByLayout(ctx, { layoutId })
    )
    expect(byLayout.map((r) => r.kind)).toEqual(["photoreal", "clay"])
    expect(byLayout[0]?.outputUrl).toBeNull()
    const byRoom = await t.run(async (ctx) =>
      doListRendersByRoom(ctx, { roomId, limit: 2 })
    )
    expect(byRoom.map((r) => r.kind)).toEqual(["photoreal", "id"])
  })
})

describe("files", () => {
  it("issues upload URLs and resolves stored files to URLs", async () => {
    const t = createTestConvex()
    const uploadUrl = await t.run(async (ctx) => doGenerateUploadUrl(ctx))
    expect(uploadUrl).toMatch(/^https?:\/\//)
    const storageId = await fakeStorageId(t)
    expect(
      await t.run(async (ctx) => doGetFileUrl(ctx, { storageId }))
    ).toContain("/api/storage/")
    expect(await t.query(api.files.getUrl, { storageId })).toContain(
      "/api/storage/"
    )
  })
})
