import {
  zCamera,
  zNewRoom,
  zShellMeasurements,
  zShellOp,
} from "@roomer/core/schema"
import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import { z } from "zod"

import type { RoomDetail } from "../../convex"
import { renderPlan } from "../../pipelines/plan"
import {
  cameraLine,
  corners,
  featureGroups,
  roomDetail,
  solveReport,
  wallLine,
} from "../format"
import { loadRoom } from "../lookup"
import { toolError, toolResult } from "../result"
import { zIncludePlan, zRoomId } from "../schemas"
import {
  defineTool,
  READ_ONLY,
  WRITES,
  type RoomerTool,
  type ToolDeps,
} from "../tool"

const MAX_SHELL_OPS = 100
const MAX_ROOM_PHOTOS = 10

async function roomPlan(room: RoomDetail, include: boolean): Promise<Buffer[]> {
  return include ? [(await renderPlan({ room })).png] : []
}

const PLAN_NOTE =
  "The plan PNG follows: x right, z down the page, C1 at (0, 0)."

export const getRoom = defineTool({
  name: "get_room",
  title: "Get room",
  description:
    "A room's fixed parts: corners (x, z mm), walls (id, corners, length, which way each faces), features grouped by kind (doors with hinge/swing, windows with sill height, radiators, obstacles, sockets, ceiling fittings) with positions along their wall, saved cameras, finishes, skirting, ceiling height and the outline solver's report. includePlan adds the floor plan PNG.",
  inputSchema: z.object({ roomId: zRoomId, includePlan: zIncludePlan }),
  annotations: READ_ONLY,
  async handler({ roomId, includePlan = false }, { api }) {
    const room = await loadRoom(api, roomId)
    return toolResult({
      text: includePlan
        ? `${roomDetail(room)}\n\n${PLAN_NOTE}`
        : roomDetail(room),
      structured: { room },
      images: await roomPlan(room, includePlan),
    })
  },
})

export const createRoom = defineTool({
  name: "create_room",
  title: "Create room",
  description:
    "Create a room from its measurements (rectangle, walk, quad or polygon — whole mm), ceiling height, optional skirting, features and finishes. Corners are solved clockwise from C1 at (0, 0); walls Wi run Ci → Ci+1. Returns the solved outline, corner angles, residual error, wall ids and the plan PNG (includePlan: false to skip it). Default cameras are created from the doors and corners.",
  inputSchema: zNewRoom.extend({
    includePlan: zIncludePlan.describe("Return the plan PNG (default true)"),
  }),
  annotations: WRITES,
  async handler({ includePlan = true, ...input }, { api }) {
    const created = await api.rooms.create(input)
    const room = await loadRoom(api, created.roomId)
    return toolResult({
      text: [
        `Created room "${room.name}" — id ${room._id}.`,
        "",
        roomDetail(room),
        ...(includePlan ? ["", PLAN_NOTE] : []),
      ].join("\n"),
      structured: { roomId: created.roomId, created, room },
      images: await roomPlan(room, includePlan),
    })
  },
})

export const setRoomShell = defineTool({
  name: "set_room_shell",
  title: "Set room outline",
  description:
    "Replace a room's outline measurements (rectangle | walk | quad | polygon, whole mm) and re-solve it. Returns corners, corner angles and the residual (re-measure if over 15mm), the walls, and the plan PNG (includePlan: false to skip). Features that no longer fit are an error unless dropInvalidFeatures: true. Every layout of the room is re-linted.",
  inputSchema: z.object({
    roomId: zRoomId,
    measurements: zShellMeasurements,
    dropInvalidFeatures: z
      .boolean()
      .optional()
      .describe("Remove features that don't fit the new outline"),
    includePlan: zIncludePlan.describe("Return the plan PNG (default true)"),
  }),
  annotations: WRITES,
  async handler(
    { roomId, measurements, dropInvalidFeatures, includePlan = true },
    { api }
  ) {
    const result = await api.rooms.setShell({
      roomId,
      measurements,
      ...(dropInvalidFeatures !== undefined ? { dropInvalidFeatures } : {}),
    })
    const room = await loadRoom(api, roomId)
    const dropped = result.droppedFeatures.map(
      (f) => `- dropped ${f.id}: ${f.problems.join(" ")}`
    )
    return toolResult({
      text: [
        `Outline of "${room.name}" updated.`,
        solveReport(result.solve),
        `Corners (x, z mm): ${corners(result.corners)}`,
        "Walls:",
        ...room.walls.map(wallLine),
        ...(dropped.length > 0 ? ["Features removed:", ...dropped] : []),
        "The room's layouts are being re-linted; read them again for fresh lint.",
        ...(includePlan ? ["", PLAN_NOTE] : []),
      ].join("\n"),
      structured: { ...result, walls: room.walls },
      images: await roomPlan(room, includePlan),
    })
  },
})

export const applyShellChanges = defineTool({
  name: "apply_shell_changes",
  title: "Edit room features",
  description:
    "Atomic batch of room edits, applied in order: addFeature (id optional — D1, WIN1, RAD1… are assigned), updateFeature (full replacement, keeps the id), removeFeature, setSkirting, setCeilingHeight, setFinishes (merge; empty string clears a field), rename. Wall features are placed by wall + offset (mm from the wall's start corner to the feature's nearest edge). If any op fails nothing is applied. Layouts are re-linted.",
  inputSchema: z.object({
    roomId: zRoomId,
    ops: z.array(zShellOp).min(1).max(MAX_SHELL_OPS),
    includePlan: zIncludePlan,
  }),
  annotations: WRITES,
  async handler({ roomId, ops, includePlan = false }, { api }) {
    const result = await api.rooms.applyShellChanges({ roomId, ops })
    const room = await loadRoom(api, roomId)
    return toolResult({
      text: [
        `Applied ${result.changes.length} room change${result.changes.length === 1 ? "" : "s"} to "${room.name}":`,
        ...result.changes.map((c) => `- ${c.summary}`),
        "",
        featureGroups(room.features, room.walls),
        "",
        "The room's layouts are being re-linted.",
        ...(includePlan ? ["", PLAN_NOTE] : []),
      ].join("\n"),
      structured: { ...result, room },
      images: await roomPlan(room, includePlan),
    })
  },
})

type PhotoResult =
  | { url: string; storageId: Id<"_storage"> }
  | { url: string; error: string }

async function storePhoto(
  deps: Pick<ToolDeps, "api">,
  url: string
): Promise<PhotoResult> {
  try {
    const { data, mime } = await deps.api.files.download(url)
    return { url, storageId: await deps.api.files.upload(data, mime) }
  } catch (error) {
    return {
      url,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const addRoomPhotos = defineTool({
  name: "add_room_photos",
  title: "Add room photos",
  description:
    "Attach photos of the real room (direct image URLs; the server downloads them) to help photoreal renders match it. At most 20 per room.",
  inputSchema: z.object({
    roomId: zRoomId,
    urls: z.array(z.url()).min(1).max(MAX_ROOM_PHOTOS),
  }),
  annotations: { ...WRITES, openWorldHint: true },
  async handler({ roomId, urls }, deps) {
    await loadRoom(deps.api, roomId)
    const results = await Promise.all(urls.map((url) => storePhoto(deps, url)))
    const stored = results.flatMap((r) =>
      "storageId" in r ? [r.storageId] : []
    )
    const lines = results.map((r) =>
      "error" in r ? `- failed ${r.url}: ${r.error}` : `- added ${r.url}`
    )
    if (stored.length === 0) {
      return toolError(
        ["No photo could be downloaded; nothing was added:", ...lines].join(
          "\n"
        ),
        { results }
      )
    }
    const { referencePhotos } = await deps.api.rooms.addReferencePhotos({
      roomId,
      storageIds: stored,
    })
    return toolResult({
      text: [
        `Added ${stored.length} of ${urls.length} photos; the room now has ${referencePhotos.length}.`,
        ...lines,
      ].join("\n"),
      structured: { results, referencePhotos },
    })
  },
})

export const listCameras = defineTool({
  name: "list_cameras",
  title: "List cameras",
  description:
    "A room's saved cameras: id, name, eye position (x, y, z mm; y = height), viewing bearing, tilt and vertical field of view. Use an id with render_view or render_photoreal. Cameras from-<door> and from-<corner> are kept in step with the room automatically.",
  inputSchema: z.object({ roomId: zRoomId }),
  annotations: READ_ONLY,
  async handler({ roomId }, { api }) {
    const room = await loadRoom(api, roomId)
    return toolResult({
      text: [
        `Cameras of "${room.name}" (${room.cameras.length}):`,
        ...room.cameras.map(cameraLine),
        'Besides these, render_view takes "top", "orbit" or an inline { position, target, fov, projection? }.',
      ].join("\n"),
      structured: { cameras: room.cameras },
    })
  },
})

export const setCamera = defineTool({
  name: "set_camera",
  title: "Save camera",
  description:
    "Create or replace a named camera in a room (by id). position and target are [x, y, z] in room mm (y = height; eye height ≈ 1,500); fov is the vertical field of view in degrees (70 ≈ estate-agent wide angle, 50 ≈ phone); projection rectilinear (default, straight lines stay straight) or fisheye (fits more of the room near the camera). Check the framing with render_view before using it for render_photoreal.",
  inputSchema: z.object({ roomId: zRoomId, camera: zCamera }),
  annotations: WRITES,
  async handler({ roomId, camera }, { api }) {
    const { created } = await api.rooms.upsertCamera({ roomId, camera })
    return toolResult({
      text: [
        `${created ? "Created" : "Updated"} camera ${camera.id}:`,
        cameraLine(camera),
        `Look through it with render_view { layoutId, camera: "${camera.id}" }.`,
      ].join("\n"),
      structured: { created, camera },
    })
  },
})

export const roomTools: RoomerTool[] = [
  getRoom,
  createRoom,
  setRoomShell,
  applyShellChanges,
  addRoomPhotos,
  listCameras,
  setCamera,
]
