import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"

import {
  fakeDeps,
  imagesOf,
  ROOM_ID,
  roomDetail,
  storageId,
  textOf,
} from "../../tests/fakes"
import { getOverview } from "../overview"
import {
  addRoomPhotos,
  applyShellChanges,
  createRoom,
  getRoom,
  listCameras,
  setCamera,
  setRoomShell,
} from "../rooms"

describe("get_overview", () => {
  it("lists each room with its layouts and the asset library", async () => {
    const deps = fakeDeps()
    const result = await getOverview.call({}, deps)
    expect(result.isError).toBeUndefined()
    const text = textOf(result)
    expect(text).toContain(`Room "Living room" — id ${ROOM_ID}`)
    expect(text).toContain('- "Starter" — id')
    expect(text).toContain("Assets: 3 (3 library, 0 custom)")
    expect(deps.api.layouts.listByRoom).toHaveBeenCalledWith({
      roomId: ROOM_ID,
    })
    expect(result.structuredContent).toMatchObject({
      assets: { total: 3, library: 3, custom: 0 },
    })
  })

  it("reports a backend failure as a tool error", async () => {
    const deps = fakeDeps()
    deps.api.rooms.list.mockRejectedValueOnce(
      new Error("[Request ID: 1] Server Error\nUncaught Error: db down")
    )
    const result = await getOverview.call({}, deps)
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("Error INTERNAL")
  })
})

describe("get_room", () => {
  it("returns walls, features and cameras, and the plan on request", async () => {
    const deps = fakeDeps()
    const plain = await getRoom.call({ roomId: ROOM_ID }, deps)
    expect(textOf(plain)).toContain("- W2 C2→C3 7,090mm · right wall")
    expect(imagesOf(plain)).toBe(0)
    const withPlan = await getRoom.call(
      { roomId: ROOM_ID, includePlan: true },
      deps
    )
    expect(imagesOf(withPlan)).toBe(1)
    expect(textOf(withPlan)).toContain("The plan PNG follows")
  })

  it("says where room ids come from when the room is missing", async () => {
    const deps = fakeDeps()
    deps.api.rooms.get.mockResolvedValueOnce(null)
    const result = await getRoom.call({ roomId: "nope" }, deps)
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(
      "Error NOT_FOUND: There's no room with id nope. get_overview lists the rooms."
    )
  })

  it("rejects arguments that don't match the schema", async () => {
    const result = await getRoom.call({}, fakeDeps())
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(
      /^Error INVALID_INPUT: Invalid input: roomId/
    )
  })
})

describe("create_room", () => {
  const input = {
    name: "Study",
    ceilingHeight: 2400,
    measurements: { kind: "rectangle", width: 3000, depth: 2500 },
  }

  it("creates the room and returns the readout and plan", async () => {
    const deps = fakeDeps()
    const result = await createRoom.call(input, deps)
    expect(deps.api.rooms.create).toHaveBeenCalledWith(input)
    expect(textOf(result)).toMatch(/^Created room "Living room" — id /)
    expect(imagesOf(result)).toBe(1)
    expect(result.structuredContent).toMatchObject({ roomId: ROOM_ID })
  })

  it("skips the plan when asked and relays validation errors verbatim", async () => {
    const deps = fakeDeps()
    const quiet = await createRoom.call({ ...input, includePlan: false }, deps)
    expect(imagesOf(quiet)).toBe(0)
    deps.api.rooms.create.mockRejectedValueOnce(
      new ConvexError({
        code: "INVALID_INPUT",
        message:
          "Some features don't fit the room. features: D1 runs past the end of W1.",
        issues: [{ path: "features", message: "D1 runs past the end of W1." }],
      })
    )
    const failed = await createRoom.call(input, deps)
    expect(failed.isError).toBe(true)
    expect(textOf(failed)).toBe(
      "Error INVALID_INPUT: Some features don't fit the room. features: D1 runs past the end of W1."
    )
  })
})

describe("set_room_shell", () => {
  it("reports the solve, the walls and any dropped features", async () => {
    const deps = fakeDeps()
    const room = roomDetail()
    deps.api.rooms.setShell.mockResolvedValueOnce({
      corners: room.shell.corners,
      solve: { ...room.shell.solve, residualMm: 18 },
      droppedFeatures: [{ id: "S2", problems: ["S2 is past the end of W6."] }],
    })
    const result = await setRoomShell.call(
      {
        roomId: ROOM_ID,
        measurements: { kind: "rectangle", width: 3000, depth: 7000 },
        dropInvalidFeatures: true,
        includePlan: false,
      },
      deps
    )
    const text = textOf(result)
    expect(text).toContain("residual 18mm — over 15mm, re-measure")
    expect(text).toContain("- dropped S2: S2 is past the end of W6.")
    expect(text).toContain("re-linted")
    expect(deps.api.rooms.setShell).toHaveBeenCalledWith(
      expect.objectContaining({ dropInvalidFeatures: true })
    )
  })
})

describe("apply_shell_changes", () => {
  it("lists the changes and the features now in the room", async () => {
    const deps = fakeDeps()
    const result = await applyShellChanges.call(
      {
        roomId: ROOM_ID,
        ops: [
          {
            op: "addFeature",
            feature: {
              type: "socket",
              wall: "W6",
              offset: 2000,
              width: 146,
              bottom: 300,
              height: 86,
            },
          },
        ],
      },
      deps
    )
    expect(textOf(result)).toContain("- Added socket S5 on W6")
    expect(textOf(result)).toContain("Features (")
  })

  it("says nothing was applied when an op fails", async () => {
    const deps = fakeDeps()
    deps.api.rooms.applyShellChanges.mockRejectedValueOnce(
      new ConvexError({
        code: "INVALID_OP",
        message: "ops[1] (removeFeature): There's no feature X9.",
        opIndex: 1,
      })
    )
    const result = await applyShellChanges.call(
      {
        roomId: ROOM_ID,
        ops: [
          { op: "setCeilingHeight", ceilingHeight: 2500 },
          { op: "removeFeature", id: "X9" },
        ],
      },
      deps
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(
      "Nothing in this batch was applied (it stopped at ops[1])"
    )
  })
})

describe("add_room_photos", () => {
  it("stores the photos that download and reports the ones that don't", async () => {
    const deps = fakeDeps()
    deps.api.files.download
      .mockResolvedValueOnce({ data: Buffer.from("jpg"), mime: "image/jpeg" })
      .mockRejectedValueOnce(new Error("HTTP 403"))
    const result = await addRoomPhotos.call(
      {
        roomId: ROOM_ID,
        urls: ["https://x.test/a.jpg", "https://x.test/b.jpg"],
      },
      deps
    )
    expect(result.isError).toBeUndefined()
    expect(textOf(result)).toContain("Added 1 of 2 photos")
    expect(textOf(result)).toContain("- failed https://x.test/b.jpg: HTTP 403")
    expect(deps.api.rooms.addReferencePhotos).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      storageIds: [storageId(1)],
    })
  })

  it("is an error when no photo downloads", async () => {
    const deps = fakeDeps()
    deps.api.files.download.mockRejectedValue(new Error("HTTP 404"))
    const result = await addRoomPhotos.call(
      { roomId: ROOM_ID, urls: ["https://x.test/a.jpg"] },
      deps
    )
    expect(result.isError).toBe(true)
    expect(deps.api.rooms.addReferencePhotos).not.toHaveBeenCalled()
  })
})

describe("cameras", () => {
  it("lists saved cameras with the alternatives", async () => {
    const deps = fakeDeps()
    const text = textOf(await listCameras.call({ roomId: ROOM_ID }, deps))
    expect(text).toMatch(/^Cameras of "Living room" \(\d+\):/)
    expect(text).toContain('"top", "orbit" or an inline')
  })

  it("saves a camera and says how to look through it", async () => {
    const deps = fakeDeps()
    const camera = {
      id: "sofa-view",
      name: "From the sofa",
      position: [500, 1100, 3700],
      target: [2900, 1000, 3700],
      fov: 60,
      projection: "fisheye",
    }
    const result = await setCamera.call({ roomId: ROOM_ID, camera }, deps)
    expect(deps.api.rooms.upsertCamera).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      camera,
    })
    expect(textOf(result)).toContain("Created camera sofa-view")
    expect(textOf(result)).toContain("fisheye")
  })

  it("relays a bad camera from the schema", async () => {
    const result = await setCamera.call(
      {
        roomId: ROOM_ID,
        camera: {
          id: "Bad Id",
          name: "x",
          position: [0, 0, 0],
          target: [1, 0, 0],
          fov: 50,
        },
      },
      fakeDeps()
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain("camera.id")
  })
})
