/**
 * Rooms: the outline, fixed features, finishes and cameras that every layout
 * of the room shares. Any change to what lint reads (outline, ceiling,
 * skirting, features) re-lints the room's layouts.
 */
import { defaultCameras } from "@roomer/core/cameras"
import {
  deriveWalls,
  toRoomGeometry,
  type RoomGeometry,
} from "@roomer/core/geometry"
import {
  applyShellOps,
  featureProblems,
  partitionFeatures,
  ShellOpError,
  syncDefaultCameras,
  withFeatureIds,
  type ShellChange,
  type ShellRoom,
} from "@roomer/core/room"
import {
  DEFAULT_SKIRTING,
  type Camera,
  type Feature,
  type Finishes,
  type ShellMeasurements,
  type ShellOp,
  type Skirting,
  zCamera,
  zNewRoom,
  zRoomSpec,
  zShellMeasurements,
  zShellOp,
  type RoomSpec,
  type ShellSolve,
  type Vec2,
} from "@roomer/core/schema"
import { solveShell, validateShell } from "@roomer/core/shell"
import { v, type Infer } from "convex/values"
import { z } from "zod"

import type { Doc, Id } from "./_generated/dataModel"
import { sameValue } from "./compare"
import {
  appError,
  invalidInput,
  issuesAt,
  notFound,
  parseInput,
} from "./errors"
import {
  appMutation,
  appQuery,
  type MutationCtx,
  type QueryCtx,
} from "./functions"
import { bestLayout, MAX_LAYOUTS_PER_ROOM, scheduleRoomRelint } from "./layouts"
import { vCamera, vNewRoom, vShellMeasurements, vShellOp } from "./validators"

/** Max ops in one `applyShellChanges` batch. */
export const MAX_SHELL_OPS = 100
/** Max reference photos per room. */
export const MAX_REFERENCE_PHOTOS = 20

// ---------------------------------------------------------------------------
// Helpers (thin-handler pattern — all logic lives here)
// ---------------------------------------------------------------------------

export async function getRoomOrThrow(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"rooms">> {
  const room = await ctx.db.get(roomId)
  if (!room) throw notFound(`There's no room with id ${roomId}.`)
  return room
}

/** The parts of a stored room that geometry, placement and lint read. */
export function roomGeometry(room: Doc<"rooms">): RoomGeometry {
  return toRoomGeometry(room)
}

/** The stored room fields a doc must satisfy; checked before every write. */
function assertValidRoomSpec(spec: RoomSpec): void {
  parseInput(zRoomSpec, spec, "room")
}

/** Did anything lint reads change between two versions of a room? */
function lintInputsChanged(before: RoomGeometry, after: RoomGeometry): boolean {
  return (
    before.ceilingHeight !== after.ceilingHeight ||
    JSON.stringify(before.corners) !== JSON.stringify(after.corners) ||
    JSON.stringify(before.skirting) !== JSON.stringify(after.skirting) ||
    JSON.stringify(before.features) !== JSON.stringify(after.features)
  )
}

/** Solve measurements into an outline, or explain why they don't make one. */
function solveOrThrow(
  measurements: z.output<typeof zShellMeasurements>
): RoomSpec["shell"] {
  const { corners, solve } = solveShell(measurements)
  const problems = validateShell(corners)
  if (problems.length > 0) {
    throw invalidInput(
      "The measurements don't make a usable room outline.",
      issuesAt("measurements", problems)
    )
  }
  return { measurements, corners, solve }
}

/** Walls as the agent and UI see them: ids, corners and lengths. */
function wallSummaries(corners: readonly Vec2[]) {
  return deriveWalls(corners).map((wall) => ({
    id: wall.id,
    startCorner: wall.startCorner,
    endCorner: wall.endCorner,
    length: Math.round(wall.length),
    inwardBearing: Math.round(wall.inwardBearing * 10) / 10,
  }))
}

/**
 * Everything the rooms index shows, in one query: each room's outline and
 * finishes, its layouts (status, lint counts, size) and the layout to open
 * first.
 */
export async function doListRooms(ctx: QueryCtx) {
  const rooms = await ctx.db.query("rooms").withIndex("by_name").take(100)
  return await Promise.all(
    rooms.map(async (room) => {
      const layouts = (
        await ctx.db
          .query("layouts")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .take(MAX_LAYOUTS_PER_ROOM)
      ).map((layout) => ({
        _id: layout._id,
        name: layout.name,
        status: layout.status,
        revision: layout.revision,
        lintCounts: layout.lint.counts,
        placementCount: layout.placements.length,
        updatedAt: layout.updatedAt,
      }))
      return {
        _id: room._id,
        name: room.name,
        ceilingHeight: room.ceilingHeight,
        corners: room.shell.corners,
        featureCount: room.features.length,
        finishes: room.finishes,
        updatedAt: room.updatedAt,
        layouts,
        bestLayoutId: bestLayout(layouts)?._id ?? null,
      }
    })
  )
}

export async function doGetRoom(ctx: QueryCtx, args: { roomId: Id<"rooms"> }) {
  const room = await ctx.db.get(args.roomId)
  if (!room) return null
  const referencePhotoUrls = await Promise.all(
    room.referencePhotos.map(async (storageId) => ({
      storageId,
      url: await ctx.storage.getUrl(storageId),
    }))
  )
  return {
    ...room,
    walls: wallSummaries(room.shell.corners),
    referencePhotoUrls,
  }
}

export type CreateRoomArgs = z.input<typeof zNewRoom>

export async function doCreateRoom(
  ctx: MutationCtx,
  args: CreateRoomArgs
): Promise<{
  roomId: Id<"rooms">
  corners: Vec2[]
  solve: ShellSolve
  featureIds: string[]
}> {
  const input = parseInput(zNewRoom, args, "room")
  const shell = solveOrThrow(input.measurements)
  const geometry: RoomGeometry = {
    corners: shell.corners,
    ceilingHeight: input.ceilingHeight,
    skirting: input.skirting ?? DEFAULT_SKIRTING,
    features: withFeatureIds(input.features ?? []),
  }
  const problems = featureProblems(geometry)
  if (problems.length > 0) {
    throw invalidInput(
      "Some features don't fit the room.",
      issuesAt(
        "features",
        problems.map((p) => p.message)
      )
    )
  }
  const spec: RoomSpec = {
    name: input.name,
    ceilingHeight: geometry.ceilingHeight,
    shell,
    skirting: geometry.skirting,
    features: geometry.features,
    finishes: input.finishes ?? {},
    cameras: defaultCameras(geometry),
  }
  assertValidRoomSpec(spec)
  const roomId = await ctx.db.insert("rooms", {
    ...spec,
    referencePhotos: [],
    updatedAt: Date.now(),
  })
  return {
    roomId,
    corners: shell.corners,
    solve: shell.solve,
    featureIds: geometry.features.map((f) => f.id),
  }
}

export async function doSetShell(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">
    measurements: z.input<typeof zShellMeasurements>
    dropInvalidFeatures?: boolean
  }
): Promise<{
  corners: Vec2[]
  solve: ShellSolve
  droppedFeatures: { id: string; problems: string[] }[]
}> {
  const room = await getRoomOrThrow(ctx, args.roomId)
  const measurements = parseInput(
    zShellMeasurements,
    args.measurements,
    "measurements",
    ["measurements"]
  )
  const shell = solveOrThrow(measurements)
  const before = roomGeometry(room)
  const reshaped: RoomGeometry = { ...before, corners: shell.corners }
  const { valid, invalid } = partitionFeatures(reshaped)
  if (invalid.length > 0 && !args.dropInvalidFeatures) {
    throw invalidInput(
      `The new outline doesn't fit ${invalid.length} existing feature${invalid.length === 1 ? "" : "s"} (${invalid.map((i) => i.feature.id).join(", ")}). Fix or remove them with apply_shell_changes first, or pass dropInvalidFeatures: true to remove them.`,
      invalid.flatMap(({ feature, problems }) =>
        issuesAt(`features[${room.features.indexOf(feature)}]`, problems)
      )
    )
  }
  const after: RoomGeometry = { ...reshaped, features: valid }
  const spec: RoomSpec = {
    name: room.name,
    ceilingHeight: room.ceilingHeight,
    shell,
    skirting: room.skirting,
    features: after.features,
    finishes: room.finishes,
    cameras: syncDefaultCameras(before, after, room.cameras),
  }
  assertValidRoomSpec(spec)
  await ctx.db.patch(room._id, {
    shell: spec.shell,
    features: spec.features,
    cameras: spec.cameras,
    updatedAt: Date.now(),
  })
  if (lintInputsChanged(before, after)) {
    await scheduleRoomRelint(ctx, room._id, "the room's outline changed")
  }
  return {
    corners: shell.corners,
    solve: shell.solve,
    droppedFeatures: invalid.map(({ feature, problems }) => ({
      id: feature.id,
      problems,
    })),
  }
}

const zShellOps = z.array(zShellOp).min(1).max(MAX_SHELL_OPS)

export async function doApplyShellChanges(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; ops: z.input<typeof zShellOps> }
): Promise<{ changes: ShellChange[]; featureIds: string[] }> {
  const ops = parseInput(zShellOps, args.ops, "shell changes", ["ops"])
  const room = await getRoomOrThrow(ctx, args.roomId)
  const before: ShellRoom = {
    ...roomGeometry(room),
    name: room.name,
    finishes: room.finishes,
  }
  let result: ReturnType<typeof applyShellOps>
  try {
    result = applyShellOps(before, ops)
  } catch (error) {
    if (!(error instanceof ShellOpError)) throw error
    const path = error.opIndex === undefined ? "ops" : `ops[${error.opIndex}]`
    throw appError({
      code: "INVALID_OP",
      message: error.message,
      issues: issuesAt(path, error.issues),
      ...(error.opIndex === undefined ? {} : { opIndex: error.opIndex }),
    })
  }
  const after = result.room
  const spec: RoomSpec = {
    name: after.name,
    ceilingHeight: after.ceilingHeight,
    shell: room.shell,
    skirting: after.skirting,
    features: after.features,
    finishes: after.finishes,
    cameras: syncDefaultCameras(before, after, room.cameras),
  }
  assertValidRoomSpec(spec)
  // replace, not patch: finishes fields removed by an op must disappear.
  await ctx.db.replace(room._id, {
    ...spec,
    referencePhotos: room.referencePhotos,
    updatedAt: Date.now(),
  })
  if (lintInputsChanged(before, after)) {
    await scheduleRoomRelint(ctx, room._id, "the room's features changed")
  }
  return {
    changes: result.changes,
    featureIds: after.features.map((f) => f.id),
  }
}

export async function doUpsertCamera(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; camera: Infer<typeof vCamera> }
): Promise<{ created: boolean }> {
  const camera = parseInput(zCamera, args.camera, "camera", ["camera"])
  const room = await getRoomOrThrow(ctx, args.roomId)
  const exists = room.cameras.some((c) => c.id === camera.id)
  const cameras = exists
    ? room.cameras.map((c) => (c.id === camera.id ? camera : c))
    : [...room.cameras, camera]
  if (!zRoomSpec.shape.cameras.safeParse(cameras).success) {
    throw invalidInput(
      `The room already has ${room.cameras.length} cameras, the most it can have. Remove one with removeCamera first.`
    )
  }
  await ctx.db.patch(room._id, { cameras, updatedAt: Date.now() })
  return { created: !exists }
}

export async function doRemoveCamera(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; cameraId: string }
): Promise<void> {
  const room = await getRoomOrThrow(ctx, args.roomId)
  if (!room.cameras.some((c) => c.id === args.cameraId)) {
    throw notFound(
      `The room has no camera ${args.cameraId}. Its cameras: ${room.cameras.map((c) => c.id).join(", ") || "none"}.`
    )
  }
  await ctx.db.patch(room._id, {
    cameras: room.cameras.filter((c) => c.id !== args.cameraId),
    updatedAt: Date.now(),
  })
}

export async function doAddReferencePhotos(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; storageIds: Id<"_storage">[] }
): Promise<{ referencePhotos: Id<"_storage">[] }> {
  const room = await getRoomOrThrow(ctx, args.roomId)
  for (const storageId of args.storageIds) {
    if (!(await ctx.db.system.get(storageId))) {
      throw notFound(`There's no uploaded file ${storageId}.`)
    }
  }
  const referencePhotos = [
    ...new Set([...room.referencePhotos, ...args.storageIds]),
  ]
  if (referencePhotos.length > MAX_REFERENCE_PHOTOS) {
    throw invalidInput(
      `A room can have at most ${MAX_REFERENCE_PHOTOS} reference photos (it has ${room.referencePhotos.length}).`
    )
  }
  await ctx.db.patch(room._id, { referencePhotos, updatedAt: Date.now() })
  return { referencePhotos }
}

/** What `doSyncRoom` makes a room match. */
export type RoomTarget = {
  measurements: ShellMeasurements
  ceilingHeight: number
  skirting: Skirting
  features: Feature[]
  finishes: Finishes
  /**
   * The exact cameras to end with. Omitted: cameras stored under a default
   * id are reset to today's defaults and custom ones are kept.
   */
  cameras?: Camera[]
}

/**
 * Make a stored room match a target spec in place: it keeps its id, name,
 * layouts and reference photos. Goes through the real helpers — a re-solve
 * if the measurements differ, then one batch of shell ops computed from the
 * difference (which validates the end state and re-lints the layouts) —
 * then sets the cameras. Returns one sentence per change; none when the
 * room already matched. Used by `pnpm seed --refresh` and `--import`.
 */
export async function doSyncRoom(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; target: RoomTarget }
): Promise<string[]> {
  const { roomId, target } = args
  const summaries: string[] = []
  const original = await getRoomOrThrow(ctx, roomId)
  const before = roomGeometry(original)

  if (!sameValue(original.shell.measurements, target.measurements)) {
    // Features that don't fit the new outline come back from the target
    // through the ops below.
    await doSetShell(ctx, {
      roomId,
      measurements: target.measurements,
      dropInvalidFeatures: true,
    })
    summaries.push("Re-solved the outline from new measurements")
  }
  const current = await getRoomOrThrow(ctx, roomId)

  const targetIds = new Set(target.features.map((f) => f.id))
  const storedById = new Map(current.features.map((f) => [f.id, f]))
  const ops: ShellOp[] = [
    ...current.features
      .filter((feature) => !targetIds.has(feature.id))
      .map((feature): ShellOp => ({ op: "removeFeature", id: feature.id })),
    ...target.features.flatMap((feature): ShellOp[] => {
      const stored = storedById.get(feature.id)
      if (!stored) return [{ op: "addFeature", feature }]
      if (sameValue(stored, feature)) return []
      const { id, ...replacement } = feature
      return [{ op: "updateFeature", id, feature: replacement }]
    }),
  ]
  if (current.ceilingHeight !== target.ceilingHeight) {
    ops.push({ op: "setCeilingHeight", ceilingHeight: target.ceilingHeight })
  }
  if (!sameValue(current.skirting, target.skirting)) {
    ops.push({ op: "setSkirting", skirting: target.skirting })
  }
  if (!sameValue(current.finishes, target.finishes)) {
    // setFinishes merges; an empty string removes a finish the target lacks.
    const cleared = Object.fromEntries(
      Object.keys(current.finishes).map((key) => [key, ""])
    )
    ops.push({
      op: "setFinishes",
      finishes: { ...cleared, ...target.finishes },
    })
  }
  if (ops.length > 0) {
    const { changes } = await doApplyShellChanges(ctx, { roomId, ops })
    summaries.push(...changes.map((change) => change.summary))
  }

  const synced = await getRoomOrThrow(ctx, roomId)
  if (target.cameras) {
    // Shell ops re-sync default cameras as they go, so compare with the
    // cameras the room started with when deciding what to report.
    if (!sameValue(synced.cameras, target.cameras)) {
      const cameras = parseInput(
        zRoomSpec.shape.cameras,
        target.cameras,
        "cameras",
        ["cameras"]
      )
      await ctx.db.patch(roomId, { cameras, updatedAt: Date.now() })
    }
    if (!sameValue(original.cameras, target.cameras)) {
      const count = target.cameras.length
      summaries.push(
        `Set the room's cameras (${count} camera${count === 1 ? "" : "s"})`
      )
    }
    return summaries
  }

  // Default cameras: replace whatever is stored under a default id (it may
  // come from older defaults) with today's; leave custom cameras alone.
  const defaults = defaultCameras(roomGeometry(synced))
  const defaultIds = new Set(
    [...defaultCameras(before), ...defaults].map((camera) => camera.id)
  )
  let reset = 0
  for (const camera of synced.cameras) {
    if (
      defaultIds.has(camera.id) &&
      !defaults.some((d) => d.id === camera.id)
    ) {
      await doRemoveCamera(ctx, { roomId, cameraId: camera.id })
      reset++
    }
  }
  for (const camera of defaults) {
    const stored = synced.cameras.find((c) => c.id === camera.id)
    if (!stored || !sameValue(stored, camera)) {
      await doUpsertCamera(ctx, { roomId, camera })
      reset++
    }
  }
  if (reset > 0) {
    summaries.push(
      `Reset ${reset} default camera${reset === 1 ? "" : "s"} to the current defaults`
    )
  }
  return summaries
}

// ---------------------------------------------------------------------------
// Convex function exports
// ---------------------------------------------------------------------------

export const list = appQuery({
  args: {},
  handler: async (ctx) => {
    return await doListRooms(ctx)
  },
})

export const get = appQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await doGetRoom(ctx, args)
  },
})

export const create = appMutation({
  args: vNewRoom.fields,
  handler: async (ctx, args) => {
    return await doCreateRoom(ctx, args)
  },
})

export const setShell = appMutation({
  args: {
    roomId: v.id("rooms"),
    measurements: vShellMeasurements,
    dropInvalidFeatures: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await doSetShell(ctx, args)
  },
})

export const applyShellChanges = appMutation({
  args: { roomId: v.id("rooms"), ops: v.array(vShellOp) },
  handler: async (ctx, args) => {
    return await doApplyShellChanges(ctx, args)
  },
})

export const upsertCamera = appMutation({
  args: { roomId: v.id("rooms"), camera: vCamera },
  handler: async (ctx, args) => {
    return await doUpsertCamera(ctx, args)
  },
})

export const removeCamera = appMutation({
  args: { roomId: v.id("rooms"), cameraId: v.string() },
  handler: async (ctx, args) => {
    await doRemoveCamera(ctx, args)
  },
})

export const addReferencePhotos = appMutation({
  args: { roomId: v.id("rooms"), storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, args) => {
    return await doAddReferencePhotos(ctx, args)
  },
})
