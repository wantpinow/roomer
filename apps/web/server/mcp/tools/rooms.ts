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
import {
  FEATURE_REFERENCE,
  MEASUREMENTS_REFERENCE,
  SHELL_OPS_REFERENCE,
  zListedCamera,
  zListedMeasurements,
  zListedNewRoom,
  zListedShellOp,
} from "../listing"
import { loadRoom } from "../lookup"
import { toolError, toolResult } from "../result"
import { zIncludePlan, zRoomId } from "../schemas"
import {
  defineTool,
  READ_ONLY,
  WRITES,
  type RoomerTool,
  type ToolDeps,
  WRITES_WEB,
} from "../tool"

const MAX_SHELL_OPS = 100
const MAX_ROOM_PHOTOS = 10

async function roomPlan(room: RoomDetail, include: boolean): Promise<Buffer[]> {
  return include ? [(await renderPlan({ room })).png] : []
}

const zIncludePlanByDefault = zIncludePlan.describe(
  "Return the plan PNG (default true)"
)

const zSetShellArgs = z.object({
  roomId: zRoomId,
  measurements: zShellMeasurements,
  dropInvalidFeatures: z
    .boolean()
    .optional()
    .describe("Remove features that don't fit the new outline"),
  includePlan: zIncludePlanByDefault,
})

const PLAN_NOTE =
  "The plan PNG follows: x right, z down the page, C1 at (0, 0)."

export const getRoom = defineTool({
  name: "get_room",
  title: "Get room",
  description:
    "A room's walls (id, length, which way each faces), corners, features by kind with positions along their wall, cameras, finishes, skirting, ceiling height and solver report. includePlan adds the plan PNG.",
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
  description: [
    "Create a room from its measurements, ceiling height, optional skirting (default 150 high \u00d7 18 deep), features and finishes. Corners are solved clockwise from C1 at (0, 0); wall Wi runs Ci \u2192 Ci+1. Returns the outline, corner angles, residual, walls and the plan PNG (includePlan: false skips it); default cameras come from the doors and corners.",
    MEASUREMENTS_REFERENCE,
    FEATURE_REFERENCE,
  ].join("\n\n"),
  inputSchema: zNewRoom.extend({ includePlan: zIncludePlanByDefault }),
  listedSchema: zListedNewRoom.extend({
    includePlan: zIncludePlanByDefault,
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
  description: [
    "Replace a room's outline measurements and re-solve: returns corners, angles, residual (re-measure if over 15mm), walls and the plan PNG (includePlan: false skips it). Features that no longer fit are an error unless dropInvalidFeatures: true. Layouts are re-linted.",
    MEASUREMENTS_REFERENCE,
  ].join("\n\n"),
  inputSchema: zSetShellArgs,
  listedSchema: zSetShellArgs.extend({ measurements: zListedMeasurements }),
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
  description: [
    "Atomic, ordered batch of room edits; if any op fails nothing is applied and the error names the op and field. updateFeature replaces every field but the id; setFinishes merges (an empty string clears a field). Layouts are re-linted.",
    SHELL_OPS_REFERENCE,
    FEATURE_REFERENCE,
  ].join("\n\n"),
  inputSchema: z.object({
    roomId: zRoomId,
    ops: z.array(zShellOp).min(1).max(MAX_SHELL_OPS),
    includePlan: zIncludePlan,
  }),
  listedSchema: z.object({
    roomId: zRoomId,
    ops: z.array(zListedShellOp).min(1).max(MAX_SHELL_OPS),
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
  annotations: WRITES_WEB,
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
    "A room's saved cameras: id, name, eye (x, y, z mm), viewing bearing, tilt and fov. from-<door> and corner-<Cn> cameras follow the room automatically.",
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
    "Create or replace a room camera by id: position and target [x, y, z] in mm (y = height; eye \u2248 1,500), fov = vertical degrees (70 \u2248 estate-agent wide angle, 50 \u2248 phone), projection rectilinear (default) or fisheye. Check the framing with render_view.",
  inputSchema: z.object({ roomId: zRoomId, camera: zCamera }),
  listedSchema: z.object({ roomId: zRoomId, camera: zListedCamera }),
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
