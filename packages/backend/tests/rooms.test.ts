import { defaultCameras } from "@roomer/core/cameras"
import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_FINISHES,
} from "@roomer/core/fixtures"
import { toRoomGeometry } from "@roomer/core/geometry"
import type { BeamFeature, Camera } from "@roomer/core/schema"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "../convex/_generated/api"
import type { Id } from "../convex/_generated/dataModel"
import {
  doAddReferencePhotos,
  doApplyShellChanges,
  doCreateRoom,
  doGetRoom,
  doRemoveCamera,
  doSetShell,
  doUpsertCamera,
} from "../convex/rooms"
import {
  createLayout,
  createLivingRoom,
  createTestConvex,
  expectAppError,
  fakeStorageId,
  type TestConvex,
} from "./setup"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const RECTANGLE = { kind: "rectangle" as const, width: 3000, depth: 4000 }

async function getRoom(t: TestConvex, roomId: Id<"rooms">) {
  const room = await t.run(async (ctx) => ctx.db.get(roomId))
  if (!room) throw new Error("room missing")
  return room
}

/** Names and args of pending scheduled functions. */
async function scheduled(t: TestConvex) {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).map(
      (job) => ({ name: job.name, args: job.args[0] })
    )
  )
}

describe("doCreateRoom", () => {
  it("stores the living room's solved outline, features and default cameras", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const room = await getRoom(t, roomId)
    expect(room.shell.corners).toEqual(LIVING_ROOM_CORNERS)
    expect(room.shell.solve).toMatchObject({ method: "walk", residualMm: 0 })
    expect(room.shell.solve.cornerAngles).toEqual([90, 90, 90, 270, 90, 90])
    expect(room.features).toEqual(LIVING_ROOM_FEATURES)
    expect(room.finishes).toEqual(LIVING_ROOM_FINISHES)
    expect(room.cameras).toEqual(defaultCameras(toRoomGeometry(room)))
    expect(room.cameras.map((c) => c.id)).toContain("from-d1")
    expect(room.referencePhotos).toEqual([])
  })

  it("assigns readable ids to features given without one", async () => {
    const t = createTestConvex()
    const result = await t.run(async (ctx) =>
      doCreateRoom(ctx, {
        name: "Box room",
        ceilingHeight: 2400,
        measurements: RECTANGLE,
        features: [
          {
            type: "door",
            wall: "W1",
            offset: 100,
            width: 800,
            bottom: 0,
            height: 2000,
            hinge: "start",
            swing: "in",
          },
          {
            type: "door",
            id: "D1",
            wall: "W3",
            offset: 100,
            width: 800,
            bottom: 0,
            height: 2000,
            hinge: "start",
            swing: "in",
          },
          { type: "pendant", x: 1500, z: 2000 },
        ],
      })
    )
    expect(result.featureIds).toEqual(["D2", "D1", "L1"])
    expect(result.corners).toEqual([
      [0, 0],
      [3000, 0],
      [3000, 4000],
      [0, 4000],
    ])
    const room = await getRoom(t, result.roomId)
    expect(room.skirting).toEqual({ height: 150, depth: 18 })
    expect(room.finishes).toEqual({})
  })

  it("lists every invalid field with its path", async () => {
    const t = createTestConvex()
    const error = await expectAppError(
      t.run(async (ctx) =>
        doCreateRoom(ctx, {
          name: "Box room",
          ceilingHeight: 2400.5,
          measurements: { kind: "rectangle", width: -3000, depth: 4000 },
        })
      ),
      "INVALID_INPUT",
      "Invalid room."
    )
    expect(error.issues?.map((i) => i.path)).toEqual([
      "ceilingHeight",
      "measurements.width",
    ])
  })

  it("rejects measurements that don't make a room outline", async () => {
    const t = createTestConvex()
    const error = await expectAppError(
      t.run(async (ctx) =>
        doCreateRoom(ctx, {
          name: "Bow tie",
          ceilingHeight: 2400,
          measurements: {
            kind: "polygon",
            corners: [
              [0, 0],
              [3000, 3000],
              [3000, 0],
              [0, 3000],
            ],
          },
        })
      ),
      "INVALID_INPUT",
      "The measurements don't make a usable room outline."
    )
    expect(error.issues?.[0]?.path).toBe("measurements")
    expect(error.message).toContain("cross each other")
  })

  it("rejects features that don't fit, naming the valid walls", async () => {
    const t = createTestConvex()
    const error = await expectAppError(
      t.run(async (ctx) =>
        doCreateRoom(ctx, {
          name: "Box room",
          ceilingHeight: 2400,
          measurements: RECTANGLE,
          features: [
            {
              type: "window",
              wall: "W9",
              offset: 0,
              width: 1000,
              bottom: 900,
              height: 1200,
              opens: "in",
            },
          ],
        })
      ),
      "INVALID_INPUT",
      "Window WIN1 is on W9, but this room's walls are W1, W2, W3, W4."
    )
    expect(error.issues).toHaveLength(1)
  })
})

describe("doGetRoom", () => {
  it("adds walls and reference photo URLs", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const photo = await fakeStorageId(t)
    await t.run(async (ctx) =>
      doAddReferencePhotos(ctx, { roomId, storageIds: [photo] })
    )
    const room = await t.run(async (ctx) => doGetRoom(ctx, { roomId }))
    expect(room?.walls.map((w) => [w.id, w.length])).toEqual([
      ["W1", 2980],
      ["W2", 7090],
      ["W3", 810],
      ["W4", 600],
      ["W5", 2170],
      ["W6", 7690],
    ])
    expect(room?.walls[5]).toMatchObject({
      startCorner: "C6",
      endCorner: "C1",
      inwardBearing: 90,
    })
    expect(room?.referencePhotoUrls).toEqual([
      { storageId: photo, url: expect.stringContaining("/api/storage/") },
    ])
  })

  it("returns null for a room that doesn't exist", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    await t.run(async (ctx) => ctx.db.delete(roomId))
    expect(await t.query(api.rooms.get, { roomId })).toBeNull()
  })
})

describe("doSetShell", () => {
  it("re-solves the outline and keeps features that still fit", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const wider = {
      kind: "polygon" as const,
      corners: LIVING_ROOM_CORNERS.map(([x, z]): [number, number] => [
        x === 0 ? 0 : x + 100,
        z,
      ]),
    }
    const result = await t.run(async (ctx) =>
      doSetShell(ctx, { roomId, measurements: wider })
    )
    expect(result.droppedFeatures).toEqual([])
    expect(result.corners[1]).toEqual([3080, 0])
    const room = await getRoom(t, roomId)
    expect(room.shell.measurements).toEqual(wider)
    expect(room.features).toEqual(LIVING_ROOM_FEATURES)
    // Default cameras follow the new outline.
    expect(room.cameras).toEqual(defaultCameras(toRoomGeometry(room)))
  })

  it("refuses an outline that would orphan features, listing them", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const error = await expectAppError(
      t.run(async (ctx) =>
        doSetShell(ctx, { roomId, measurements: RECTANGLE })
      ),
      "INVALID_INPUT",
      "The new outline doesn't fit"
    )
    // A 3m × 4m rectangle has no W5/W6, and is too short for D2 on W2.
    expect(error.message).toContain(
      "pass dropInvalidFeatures: true to remove them"
    )
    expect(error.issues?.map((i) => i.path)).toContain("features[1]")
    expect((await getRoom(t, roomId)).shell.measurements.kind).toBe("walk")
  })

  it("drops the orphaned features when asked, and says which", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const result = await t.run(async (ctx) =>
      doSetShell(ctx, {
        roomId,
        measurements: RECTANGLE,
        dropInvalidFeatures: true,
      })
    )
    const dropped = result.droppedFeatures.map((f) => f.id)
    expect(dropped).toEqual([
      "D2",
      "WIN1",
      "OB1",
      "RAD1",
      "L2",
      "S1",
      "S2",
      "S4",
    ])
    const room = await getRoom(t, roomId)
    // BM1 spans x 0–2,980 at z 2,650, inside the 3,000 × 4,000 rectangle.
    expect(room.features.map((f) => f.id)).toEqual(["D1", "BM1", "L1", "S3"])
  })

  it("schedules a re-lint of every layout in the room", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const a = await createLayout(t, roomId, "A")
    const b = await createLayout(t, roomId, "B")
    await t.run(async (ctx) =>
      doSetShell(ctx, {
        roomId,
        measurements: RECTANGLE,
        dropInvalidFeatures: true,
      })
    )
    expect(await scheduled(t)).toEqual([
      {
        name: "layouts:relint",
        args: { layoutId: a, cause: "the room's outline changed" },
      },
      {
        name: "layouts:relint",
        args: { layoutId: b, cause: "the room's outline changed" },
      },
    ])
  })
})

describe("doApplyShellChanges", () => {
  it("applies a batch, assigning ids and reporting each change", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const result = await t.run(async (ctx) =>
      doApplyShellChanges(ctx, {
        roomId,
        ops: [
          {
            op: "addFeature",
            feature: {
              type: "socket",
              wall: "W5",
              offset: 1900,
              width: 86,
              bottom: 300,
              height: 86,
            },
          },
          { op: "removeFeature", id: "S4" },
          { op: "rename", name: "Lounge" },
        ],
      })
    )
    expect(result.changes.map((c) => c.summary)).toEqual([
      "Added socket S5 on W5 at 1,900mm",
      "Removed socket S4",
      "Renamed the room from 'Living room' to 'Lounge'",
    ])
    const room = await getRoom(t, roomId)
    expect(room.name).toBe("Lounge")
    expect(room.features.map((f) => f.id)).toContain("S5")
    expect(room.features.map((f) => f.id)).not.toContain("S4")
  })

  it("points at the failing op with INVALID_OP", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const error = await expectAppError(
      t.run(async (ctx) =>
        doApplyShellChanges(ctx, {
          roomId,
          ops: [
            { op: "rename", name: "Lounge" },
            { op: "removeFeature", id: "D9" },
          ],
        })
      ),
      "INVALID_OP",
      "ops[1] (removeFeature): There's no feature D9"
    )
    expect(error.opIndex).toBe(1)
    expect(error.issues?.[0]?.path).toBe("ops[1]")
    // Atomic: the rename didn't land either.
    expect((await getRoom(t, roomId)).name).toBe("Living room")
  })

  it("blames the op that leaves a feature invalid", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const error = await expectAppError(
      t.run(async (ctx) =>
        doApplyShellChanges(ctx, {
          roomId,
          ops: [
            { op: "setSkirting", skirting: { height: 100, depth: 12 } },
            { op: "setCeilingHeight", ceilingHeight: 2000 },
          ],
        })
      ),
      "INVALID_OP",
      "Window WIN1's top is at 2,100mm"
    )
    expect(error.opIndex).toBe(1)
    expect(error.issues).toHaveLength(2)
  })

  it("rejects malformed ops with zod paths", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const error = await expectAppError(
      t.run(async (ctx) =>
        doApplyShellChanges(ctx, {
          roomId,
          ops: [{ op: "setCeilingHeight", ceilingHeight: -1 }],
        })
      ),
      "INVALID_INPUT"
    )
    expect(error.issues?.map((i) => i.path)).toEqual(["ops[0].ceilingHeight"])
  })

  it("removes a cleared finish from the stored room", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    await t.run(async (ctx) =>
      doApplyShellChanges(ctx, {
        roomId,
        ops: [{ op: "setFinishes", finishes: { notes: "", walls: "sage" } }],
      })
    )
    const { notes, ...rest } = LIVING_ROOM_FINISHES
    void notes
    expect((await getRoom(t, roomId)).finishes).toEqual({
      ...rest,
      walls: "sage",
    })
  })

  it("re-lints layouts only when something lint reads changed", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    await createLayout(t, roomId)
    await t.run(async (ctx) =>
      doApplyShellChanges(ctx, {
        roomId,
        ops: [
          { op: "rename", name: "Lounge" },
          { op: "setFinishes", finishes: { walls: "sage" } },
        ],
      })
    )
    expect(await scheduled(t)).toEqual([])
    await t.run(async (ctx) =>
      doApplyShellChanges(ctx, {
        roomId,
        ops: [{ op: "setCeilingHeight", ceilingHeight: 2500 }],
      })
    )
    expect((await scheduled(t)).map((job) => job.args)).toEqual([
      expect.objectContaining({ cause: "the room's features changed" }),
    ])
  })

  it("keeps default cameras in step with doors, and custom cameras as they are", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const custom: Camera = {
      id: "sofa-view",
      name: "From the sofa",
      position: [500, 1100, 4000],
      target: [2900, 1100, 4000],
      fov: 55,
    }
    await t.run(async (ctx) => doUpsertCamera(ctx, { roomId, camera: custom }))
    await t.run(async (ctx) =>
      doApplyShellChanges(ctx, {
        roomId,
        ops: [{ op: "removeFeature", id: "D2" }],
      })
    )
    const room = await getRoom(t, roomId)
    const ids = room.cameras.map((c) => c.id)
    expect(ids).not.toContain("from-d2")
    expect(ids).toContain("from-d1")
    expect(room.cameras.at(-1)).toEqual(custom)
  })
})

describe("ceiling beams", () => {
  const beam: BeamFeature = {
    type: "beam",
    id: "BM2",
    label: "Kitchen-end beam",
    start: [0, 1000],
    end: [2980, 1000],
    width: 200,
    drop: 180,
  }

  it("round-trips a room with a beam through create and get", async () => {
    const t = createTestConvex()
    const { roomId } = await t.mutation(api.rooms.create, {
      name: "Beamed box",
      ceilingHeight: 2400,
      measurements: { kind: "rectangle", width: 2980, depth: 4000 },
      features: [
        beam,
        { ...beam, id: undefined, start: [0, 3000], end: [2980, 3000] },
      ],
    })
    const room = await t.query(api.rooms.get, { roomId })
    expect(room?.features).toEqual([
      beam,
      { ...beam, id: "BM3", start: [0, 3000], end: [2980, 3000] },
    ])
  })

  it("adds and removes a beam with applyShellChanges", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const { id: _id, ...unnamed } = beam
    void _id
    const added = await t.run(async (ctx) =>
      doApplyShellChanges(ctx, {
        roomId,
        ops: [{ op: "addFeature", feature: unnamed }],
      })
    )
    expect(added.changes.map((c) => c.summary)).toEqual([
      "Added beam BM2 from (0, 1,000) to (2,980, 1,000)",
    ])
    expect((await getRoom(t, roomId)).features.at(-1)).toEqual({
      ...beam,
      id: "BM2",
    })
    await t.run(async (ctx) =>
      doApplyShellChanges(ctx, {
        roomId,
        ops: [{ op: "removeFeature", id: "BM2" }],
      })
    )
    const ids = (await getRoom(t, roomId)).features.map((f) => f.id)
    expect(ids).not.toContain("BM2")
    expect(ids).toContain("BM1")
  })

  it("rejects a beam that ends outside the room", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    await expectAppError(
      t.run(async (ctx) =>
        doApplyShellChanges(ctx, {
          roomId,
          ops: [
            {
              op: "addFeature",
              feature: { ...beam, start: [2500, 7400], end: [0, 7400] },
            },
          ],
        })
      ),
      "INVALID_OP",
      "Beam BM2 ends at (2,500, 7,400), outside the room's outline."
    )
  })
})

describe("doUpsertCamera", () => {
  const camera: Camera = {
    id: "window-view",
    name: "Towards the window",
    position: [1490, 1600, 1000],
    target: [1000, 1200, 7690],
    fov: 50,
  }

  it("adds a new camera, then replaces it by id", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const before = (await getRoom(t, roomId)).cameras.length
    expect(
      await t.run(async (ctx) => doUpsertCamera(ctx, { roomId, camera }))
    ).toEqual({ created: true })
    expect(
      await t.run(async (ctx) =>
        doUpsertCamera(ctx, { roomId, camera: { ...camera, fov: 65 } })
      )
    ).toEqual({ created: false })
    const cameras = (await getRoom(t, roomId)).cameras
    expect(cameras).toHaveLength(before + 1)
    expect(cameras.find((c) => c.id === "window-view")?.fov).toBe(65)
  })

  it("validates the camera", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const error = await expectAppError(
      t.run(async (ctx) =>
        doUpsertCamera(ctx, { roomId, camera: { ...camera, fov: 5 } })
      ),
      "INVALID_INPUT"
    )
    expect(error.issues?.map((i) => i.path)).toEqual(["camera.fov"])
  })

  it("refuses a 51st camera", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const existing = (await getRoom(t, roomId)).cameras.length
    for (let i = existing; i < 50; i++) {
      await t.run(async (ctx) =>
        doUpsertCamera(ctx, { roomId, camera: { ...camera, id: `cam-${i}` } })
      )
    }
    await expectAppError(
      t.run(async (ctx) => doUpsertCamera(ctx, { roomId, camera })),
      "INVALID_INPUT",
      "the most it can have"
    )
  })
})

describe("doRemoveCamera", () => {
  it("removes a camera, and lists the cameras when the id is unknown", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    await t.run(async (ctx) =>
      doRemoveCamera(ctx, { roomId, cameraId: "from-d1" })
    )
    const ids = (await getRoom(t, roomId)).cameras.map((c) => c.id)
    expect(ids).not.toContain("from-d1")
    await expectAppError(
      t.run(async (ctx) =>
        doRemoveCamera(ctx, { roomId, cameraId: "from-d1" })
      ),
      "NOT_FOUND",
      `The room has no camera from-d1. Its cameras: ${ids.join(", ")}.`
    )
  })
})

describe("doAddReferencePhotos", () => {
  it("appends photos once each", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const a = await fakeStorageId(t, "a")
    const b = await fakeStorageId(t, "b")
    await t.run(async (ctx) =>
      doAddReferencePhotos(ctx, { roomId, storageIds: [a] })
    )
    const result = await t.run(async (ctx) =>
      doAddReferencePhotos(ctx, { roomId, storageIds: [a, b] })
    )
    expect(result.referencePhotos).toEqual([a, b])
  })

  it("refuses a file that doesn't exist", async () => {
    const t = createTestConvex()
    const roomId = await createLivingRoom(t)
    const gone = await fakeStorageId(t)
    await t.run(async (ctx) => ctx.storage.delete(gone))
    await expectAppError(
      t.run(async (ctx) =>
        doAddReferencePhotos(ctx, { roomId, storageIds: [gone] })
      ),
      "NOT_FOUND",
      "There's no uploaded file"
    )
  })
})

describe("rooms API", () => {
  it("creates and lists rooms through the public functions", async () => {
    const t = createTestConvex()
    const { roomId } = await t.mutation(api.rooms.create, {
      name: "Box room",
      ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
      measurements: RECTANGLE,
    })
    const rooms = await t.query(api.rooms.list, {})
    expect(rooms).toEqual([
      expect.objectContaining({
        _id: roomId,
        name: "Box room",
        featureCount: 0,
      }),
    ])
  })
})
