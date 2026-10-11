/**
 * Layouts: named arrangements of a room's furniture. Every change goes
 * through `applyChanges` (core `applyOps`), is linted, bumps the revision
 * and appends an activity-feed event. The stored lint report is kept fresh
 * when the room or a placed asset changes (scheduled `relint`).
 */
import { deriveWalls, toRoomGeometry } from "@roomer/core/geometry"
import { lint } from "@roomer/core/lint"
import {
  applyOps,
  describePlacement,
  OpError,
  PlacementError,
  type Change,
  type PlacementRelation,
  type ResolvedAsset,
} from "@roomer/core/placement"
import { joinChangeSummaries } from "@roomer/core/room"
import {
  zFinishes,
  zLabel,
  zLayoutOp,
  zLayoutStatus,
  zNote,
  type Finishes,
  type LintCounts,
  type LintReport,
} from "@roomer/core/schema"
import { zodToConvex } from "convex-helpers/server/zod4"
import { v } from "convex/values"
import { z } from "zod"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"
import {
  assetSpecOf,
  findAssetByRef,
  loadAssets,
  primaryImageUrl,
} from "./assets"
import {
  appError,
  conflict,
  invalidInput,
  notFound,
  parseInput,
} from "./errors"
import {
  appMutation,
  appQuery,
  type MutationCtx,
  type QueryCtx,
} from "./functions"
import { getRoomOrThrow } from "./rooms"
import {
  vFinishes,
  vLayoutName,
  vLayoutNotes,
  vLayoutOp,
  vLayoutStatus,
  zActor,
  zStoredLayoutSpec,
  type Actor,
  type StoredPlacement,
} from "./validators"

/** Max ops in one `applyChanges` batch. */
export const MAX_LAYOUT_OPS = 100
/** Max events one `events` call returns. */
export const MAX_EVENTS = 100
/** Max layouts listed per room. */
export const MAX_LAYOUTS_PER_ROOM = 200

/** Callers of public mutations are the agent or a person, never Roomer. */
const zPublicActor = zActor.exclude(["system"])
const vPublicActor = zodToConvex(zPublicActor)

const zLayoutOps = z.array(zLayoutOp).min(1).max(MAX_LAYOUT_OPS)

// ---------------------------------------------------------------------------
// Helpers (thin-handler pattern — all logic lives here)
// ---------------------------------------------------------------------------

export async function getLayoutOrThrow(
  ctx: QueryCtx,
  layoutId: Id<"layouts">
): Promise<Doc<"layouts">> {
  const layout = await ctx.db.get(layoutId)
  if (!layout) throw notFound(`There's no layout with id ${layoutId}.`)
  return layout
}

/** Lint placements in a room, with assets keyed by id (as lint expects). */
export function lintLayout(
  room: Doc<"rooms">,
  placements: readonly StoredPlacement[],
  assets: ReadonlyMap<Id<"assets">, Doc<"assets">>
): LintReport {
  return lint({
    room: toRoomGeometry(room),
    placements,
    assets: Object.fromEntries(
      [...assets].map(([id, asset]) => [id, assetSpecOf(asset)])
    ),
  })
}

async function lintStored(
  ctx: QueryCtx,
  room: Doc<"rooms">,
  placements: readonly StoredPlacement[]
): Promise<LintReport> {
  const assets = await loadAssets(
    ctx,
    placements.map((p) => p.assetId)
  )
  return lintLayout(room, placements, assets)
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

/** "1 error, 2 warnings, 0 info". */
export function describeLintCounts(counts: LintCounts): string {
  return `${plural(counts.error, "error")}, ${plural(counts.warning, "warning")}, ${counts.info} info`
}

function sameCounts(a: LintCounts, b: LintCounts): boolean {
  return a.error === b.error && a.warning === b.warning && a.info === b.info
}

async function appendEvent(
  ctx: MutationCtx,
  event: {
    layoutId: Id<"layouts">
    revision: number
    actor: Actor
    summary: string
    changes: Change[]
    lintCounts: LintCounts
  }
): Promise<Id<"layoutEvents">> {
  return await ctx.db.insert("layoutEvents", {
    ...event,
    createdAt: Date.now(),
  })
}

/** Make `layoutAssetRefs` match the assets the placements use. */
export async function syncLayoutAssetRefs(
  ctx: MutationCtx,
  layoutId: Id<"layouts">,
  placements: readonly StoredPlacement[]
): Promise<void> {
  const wanted = new Set(placements.map((p) => p.assetId))
  const existing = await ctx.db
    .query("layoutAssetRefs")
    .withIndex("by_layout", (q) => q.eq("layoutId", layoutId))
    .collect()
  const have = new Set<Id<"assets">>()
  for (const ref of existing) {
    if (wanted.has(ref.assetId) && !have.has(ref.assetId)) {
      have.add(ref.assetId)
    } else {
      await ctx.db.delete(ref._id)
    }
  }
  for (const assetId of wanted) {
    if (!have.has(assetId)) {
      await ctx.db.insert("layoutAssetRefs", { layoutId, assetId })
    }
  }
}

/**
 * Recompute a layout's stored lint (after its room or an asset changed).
 * Appends a `system` event when the counts move, so the activity feed
 * explains why new issues appeared. Returns null if the layout is gone.
 */
export async function doRelintLayout(
  ctx: MutationCtx,
  args: { layoutId: Id<"layouts">; cause: string }
): Promise<LintReport | null> {
  const layout = await ctx.db.get(args.layoutId)
  if (!layout) return null
  const room = await getRoomOrThrow(ctx, layout.roomId)
  const report = await lintStored(ctx, room, layout.placements)
  await ctx.db.patch(layout._id, { lint: report })
  if (!sameCounts(layout.lint.counts, report.counts)) {
    await appendEvent(ctx, {
      layoutId: layout._id,
      revision: layout.revision,
      actor: "system",
      summary: `Re-checked after ${args.cause}: now ${describeLintCounts(report.counts)} (was ${describeLintCounts(layout.lint.counts)})`,
      changes: [],
      lintCounts: report.counts,
    })
  }
  return report
}

/**
 * Re-lint each layout in its own scheduled mutation: linting is the most
 * expensive thing Roomer does, and a room may have many layouts.
 */
async function scheduleRelints(
  ctx: MutationCtx,
  layoutIds: Iterable<Id<"layouts">>,
  cause: string
): Promise<number> {
  let count = 0
  for (const layoutId of new Set(layoutIds)) {
    await ctx.scheduler.runAfter(0, internal.layouts.relint, {
      layoutId,
      cause,
    })
    count++
  }
  return count
}

/** Schedule a re-lint of every layout of a room. */
export async function scheduleRoomRelint(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  cause: string
): Promise<number> {
  const layouts = await ctx.db
    .query("layouts")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_LAYOUTS_PER_ROOM)
  return await scheduleRelints(
    ctx,
    layouts.map((l) => l._id),
    cause
  )
}

/** Schedule a re-lint of every layout that places an asset. */
export async function scheduleAssetRelint(
  ctx: MutationCtx,
  assetId: Id<"assets">,
  cause: string
): Promise<number> {
  const refs = await ctx.db
    .query("layoutAssetRefs")
    .withIndex("by_asset", (q) => q.eq("assetId", assetId))
    .take(1000)
  return await scheduleRelints(
    ctx,
    refs.map((r) => r.layoutId),
    cause
  )
}

/** Most promising first: favourite, then candidate, then draft. */
const STATUS_RANK: Record<Doc<"layouts">["status"], number> = {
  favourite: 0,
  candidate: 1,
  draft: 2,
  archived: 3,
}

/**
 * The layout to show first for a room: the most promising status
 * (favourite > candidate > draft), then the fewest lint errors, then the
 * fewest warnings, then the most recently changed. Archived layouts are never
 * picked; null when there is nothing else.
 */
export function bestLayout<
  L extends Pick<Doc<"layouts">, "status" | "updatedAt"> & {
    lintCounts: LintCounts
  },
>(layouts: readonly L[]): L | null {
  const ranked = layouts
    .filter((layout) => layout.status !== "archived")
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        a.lintCounts.error - b.lintCounts.error ||
        a.lintCounts.warning - b.lintCounts.warning ||
        b.updatedAt - a.updatedAt
    )
  return ranked[0] ?? null
}

export type LayoutPrice = {
  /** Sum of the priced items' prices. */
  amount: number
  /** The shared currency, or null when none or several are given. */
  currency: string | null
  mixedCurrencies: boolean
  /** Placements whose asset has no price. */
  unpricedItems: number
}

export function layoutPrice(
  placements: readonly StoredPlacement[],
  assets: ReadonlyMap<Id<"assets">, Doc<"assets">>
): LayoutPrice {
  let amount = 0
  let unpricedItems = 0
  const currencies = new Set<string>()
  for (const placement of placements) {
    const product = assets.get(placement.assetId)?.product
    if (product?.price === undefined) {
      unpricedItems++
      continue
    }
    amount += product.price
    if (product.currency) currencies.add(product.currency)
  }
  const [only] = currencies
  return {
    amount: Math.round(amount * 100) / 100,
    currency: currencies.size === 1 && only !== undefined ? only : null,
    mixedCurrencies: currencies.size > 1,
    unpricedItems,
  }
}

export async function doListLayouts(
  ctx: QueryCtx,
  args: { roomId: Id<"rooms"> }
) {
  const layouts = await ctx.db
    .query("layouts")
    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
    .take(MAX_LAYOUTS_PER_ROOM)
  const assets = await loadAssets(
    ctx,
    layouts.flatMap((l) => l.placements.map((p) => p.assetId))
  )
  return layouts.map((layout) => ({
    _id: layout._id,
    _creationTime: layout._creationTime,
    roomId: layout.roomId,
    name: layout.name,
    status: layout.status,
    ...(layout.parentId ? { parentId: layout.parentId } : {}),
    revision: layout.revision,
    lintCounts: layout.lint.counts,
    updatedAt: layout.updatedAt,
    placementCount: layout.placements.length,
    price: layoutPrice(layout.placements, assets),
  }))
}

export async function doGetLayout(
  ctx: QueryCtx,
  args: { layoutId: Id<"layouts"> }
) {
  const layout = await ctx.db.get(args.layoutId)
  if (!layout) return null
  const room = await getRoomOrThrow(ctx, layout.roomId)
  const assets = await loadAssets(
    ctx,
    layout.placements.map((p) => p.assetId)
  )
  const geometry = toRoomGeometry(room)
  const walls = deriveWalls(geometry.corners)
  const relations: Record<string, PlacementRelation> = {}
  for (const placement of layout.placements) {
    const asset = assets.get(placement.assetId)
    if (asset) {
      relations[placement.id] = describePlacement(placement, asset, {
        room: geometry,
        walls,
      })
    }
  }
  const entries = await Promise.all(
    [...assets.values()].map(async (asset) => ({
      ...assetSpecOf(asset),
      _id: asset._id,
      key: asset.key,
      source: asset.source,
      primaryImageUrl: await primaryImageUrl(ctx, asset),
    }))
  )
  return {
    ...layout,
    assets: Object.fromEntries(entries.map((entry) => [entry._id, entry])),
    relations,
    price: layoutPrice(layout.placements, assets),
  }
}

export async function doCreateLayout(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">
    name: string
    notes?: string
    status?: Doc<"layouts">["status"]
    fromLayoutId?: Id<"layouts">
    actor?: Actor
  }
): Promise<{ layoutId: Id<"layouts">; lint: LintReport }> {
  const name = parseInput(zLabel, args.name, "layout name", ["name"])
  const notes =
    args.notes === undefined
      ? undefined
      : parseInput(zNote, args.notes, "notes", ["notes"])
  const room = await getRoomOrThrow(ctx, args.roomId)
  let source: Doc<"layouts"> | undefined
  if (args.fromLayoutId !== undefined) {
    source = await getLayoutOrThrow(ctx, args.fromLayoutId)
    if (source.roomId !== room._id) {
      throw invalidInput(
        `Layout '${source.name}' belongs to a different room; a fork stays in its parent's room.`
      )
    }
  }
  const placements = source?.placements ?? []
  const report = await lintStored(ctx, room, placements)
  const layoutId = await ctx.db.insert("layouts", {
    roomId: room._id,
    name,
    ...(notes !== undefined ? { notes } : {}),
    ...(source ? { parentId: source._id } : {}),
    status: args.status ?? "draft",
    ...(source?.finishes ? { finishes: source.finishes } : {}),
    placements,
    revision: 0,
    lint: report,
    updatedAt: Date.now(),
  })
  await syncLayoutAssetRefs(ctx, layoutId, placements)
  await appendEvent(ctx, {
    layoutId,
    revision: 0,
    actor: args.actor ?? "user",
    summary: source
      ? `Forked '${source.name}' as '${name}' (${plural(placements.length, "item")})`
      : `Created layout '${name}'`,
    changes: [],
    lintCounts: report.counts,
  })
  return { layoutId, lint: report }
}

export async function doUpdateLayout(
  ctx: MutationCtx,
  args: {
    layoutId: Id<"layouts">
    name?: string
    notes?: string
    status?: Doc<"layouts">["status"]
    /** A finishes override; null removes it. */
    finishes?: Finishes | null
    actor?: Actor
    expectedRevision?: number
  }
): Promise<{ revision: number }> {
  const layout = await getLayoutOrThrow(ctx, args.layoutId)
  assertRevision(layout, args.expectedRevision)
  const name =
    args.name === undefined
      ? undefined
      : parseInput(zLabel, args.name, "layout name", ["name"])
  const notes =
    args.notes === undefined
      ? undefined
      : parseInput(zNote, args.notes, "notes", ["notes"])
  const status =
    args.status === undefined
      ? undefined
      : parseInput(zLayoutStatus, args.status, "status", ["status"])
  const finishes =
    args.finishes === undefined || args.finishes === null
      ? args.finishes
      : parseInput(zFinishes, args.finishes, "finishes", ["finishes"])

  const summaries: string[] = []
  const next: Doc<"layouts"> = { ...layout }
  if (name !== undefined && name !== layout.name) {
    summaries.push(`Renamed '${layout.name}' to '${name}'`)
    next.name = name
  }
  if (notes !== undefined && notes !== (layout.notes ?? "")) {
    summaries.push(notes === "" ? "Cleared the notes" : "Updated the notes")
    if (notes === "") delete next.notes
    else next.notes = notes
  }
  if (status !== undefined && status !== layout.status) {
    summaries.push(`Marked as ${status}`)
    next.status = status
  }
  const finishesChanged =
    finishes !== undefined &&
    JSON.stringify(finishes ?? null) !== JSON.stringify(layout.finishes ?? null)
  if (finishesChanged) {
    if (finishes === null) {
      summaries.push("Removed the finishes override")
      delete next.finishes
    } else {
      summaries.push(
        `Set the finishes override (${Object.keys(finishes).join(", ") || "empty"})`
      )
      next.finishes = finishes
    }
    // Finishes are part of what gets rendered, so they bump the revision.
    next.revision = layout.revision + 1
  }
  if (summaries.length === 0) return { revision: layout.revision }

  const { _id, _creationTime, ...fields } = next
  void _creationTime
  // replace, not patch: cleared notes/finishes must disappear.
  await ctx.db.replace(_id, { ...fields, updatedAt: Date.now() })
  await appendEvent(ctx, {
    layoutId: layout._id,
    revision: next.revision,
    actor: args.actor ?? "user",
    summary: joinChangeSummaries(summaries),
    changes: [],
    lintCounts: layout.lint.counts,
  })
  return { revision: next.revision }
}

function assertRevision(
  layout: Doc<"layouts">,
  expectedRevision: number | undefined
): void {
  if (expectedRevision !== undefined && expectedRevision !== layout.revision) {
    throw conflict(
      `Layout '${layout.name}' is at revision ${layout.revision}, not ${expectedRevision}: it changed since you read it. Re-read it and apply your changes again.`
    )
  }
}

/** Resolve every asset reference the ops and placements use, by id or key. */
async function resolveAssets(
  ctx: QueryCtx,
  placements: readonly StoredPlacement[],
  refs: readonly string[]
): Promise<{
  byRef: Map<string, Doc<"assets">>
  byId: Map<Id<"assets">, Doc<"assets">>
}> {
  const byId = await loadAssets(
    ctx,
    placements.map((p) => p.assetId)
  )
  const byRef = new Map<string, Doc<"assets">>()
  for (const [id, asset] of byId) byRef.set(id, asset)
  for (const ref of new Set(refs)) {
    if (byRef.has(ref)) continue
    const asset = await findAssetByRef(ctx, ref)
    if (!asset) continue
    byRef.set(ref, asset)
    byRef.set(asset._id, asset)
    byId.set(asset._id, asset)
  }
  return { byRef, byId }
}

export type ApplyChangesArgs = {
  layoutId: Id<"layouts">
  ops: z.input<typeof zLayoutOps>
  actor: Actor
  expectedRevision?: number
}

export async function doApplyChanges(
  ctx: MutationCtx,
  args: ApplyChangesArgs
): Promise<{
  revision: number
  changes: Change[]
  lint: LintReport
  placements: StoredPlacement[]
}> {
  const ops = parseInput(zLayoutOps, args.ops, "layout changes", ["ops"])
  const layout = await getLayoutOrThrow(ctx, args.layoutId)
  assertRevision(layout, args.expectedRevision)
  const room = await getRoomOrThrow(ctx, layout.roomId)
  const refs = ops.flatMap((op) =>
    op.op === "add" || op.op === "swap" ? [op.asset] : []
  )
  const { byRef, byId } = await resolveAssets(ctx, layout.placements, refs)
  const resolver = (ref: string): ResolvedAsset | undefined => {
    const asset = byRef.get(ref)
    return asset
      ? { id: asset._id, spec: assetSpecOf(asset), key: asset.key }
      : undefined
  }

  let result: ReturnType<typeof applyOps>
  try {
    result = applyOps({
      room: toRoomGeometry(room),
      placements: layout.placements,
      ops,
      assets: resolver,
    })
  } catch (error) {
    if (error instanceof OpError) {
      throw appError({
        code: "INVALID_OP",
        message: error.message,
        issues: [{ path: `ops[${error.index}]`, message: error.detail }],
        opIndex: error.index,
      })
    }
    if (error instanceof PlacementError) {
      throw appError({ code: "INVALID_OP", message: error.message })
    }
    throw error
  }

  const placements: StoredPlacement[] = result.placements.map((placement) => {
    const assetId = ctx.db.normalizeId("assets", placement.assetId)
    if (!assetId) {
      throw new Error(
        `applyOps returned placement ${placement.id} with an unresolved asset id ${placement.assetId}`
      )
    }
    return { ...placement, assetId }
  })
  if (!zStoredLayoutSpec.shape.placements.safeParse(placements).success) {
    throw invalidInput(
      `These changes would leave ${placements.length} items in the layout; a layout holds at most 300.`
    )
  }
  const report = lintLayout(room, placements, byId)
  const revision = layout.revision + 1
  await ctx.db.patch(layout._id, {
    placements,
    lint: report,
    revision,
    updatedAt: Date.now(),
  })
  await syncLayoutAssetRefs(ctx, layout._id, placements)
  await appendEvent(ctx, {
    layoutId: layout._id,
    revision,
    actor: args.actor,
    summary: joinChangeSummaries(result.changes.map((c) => c.summary)),
    changes: result.changes,
    lintCounts: report.counts,
  })
  return { revision, changes: result.changes, lint: report, placements }
}

export async function doRemoveLayout(
  ctx: MutationCtx,
  args: { layoutId: Id<"layouts"> }
): Promise<void> {
  const layout = await getLayoutOrThrow(ctx, args.layoutId)
  for await (const ref of ctx.db
    .query("layoutAssetRefs")
    .withIndex("by_layout", (q) => q.eq("layoutId", layout._id))) {
    await ctx.db.delete(ref._id)
  }
  for await (const event of ctx.db
    .query("layoutEvents")
    .withIndex("by_layout", (q) => q.eq("layoutId", layout._id))) {
    await ctx.db.delete(event._id)
  }
  for await (const render of ctx.db
    .query("renders")
    .withIndex("by_layout", (q) => q.eq("layoutId", layout._id))) {
    // The render's own images go with it; product photos (references)
    // belong to their assets.
    const owned = [
      ...(render.output ? [render.output] : []),
      ...render.inputs
        .filter((input) => input.role !== "reference")
        .map((input) => input.storageId),
    ]
    for (const storageId of owned) await ctx.storage.delete(storageId)
    await ctx.db.delete(render._id)
  }
  await ctx.db.delete(layout._id)
}

export async function doListEvents(
  ctx: QueryCtx,
  args: { layoutId: Id<"layouts">; limit?: number }
) {
  const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), MAX_EVENTS)
  return await ctx.db
    .query("layoutEvents")
    .withIndex("by_layout", (q) => q.eq("layoutId", args.layoutId))
    .order("desc")
    .take(limit)
}

export async function doRoomActivity(
  ctx: QueryCtx,
  args: { roomId: Id<"rooms"> }
) {
  const layouts = await ctx.db
    .query("layouts")
    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
    .take(MAX_LAYOUTS_PER_ROOM)
  const perLayout = await Promise.all(
    layouts.map(async (layout) => ({
      layoutId: layout._id,
      name: layout.name,
      latest: await ctx.db
        .query("layoutEvents")
        .withIndex("by_layout", (q) => q.eq("layoutId", layout._id))
        .order("desc")
        .first(),
      latestByAgent: await ctx.db
        .query("layoutEvents")
        .withIndex("by_layout_actor", (q) =>
          q.eq("layoutId", layout._id).eq("actor", "agent")
        )
        .order("desc")
        .first(),
    }))
  )
  const newest = (
    events: (Doc<"layoutEvents"> | null)[]
  ): Doc<"layoutEvents"> | null =>
    events.reduce<Doc<"layoutEvents"> | null>(
      (best, event) =>
        event && (!best || event.createdAt > best.createdAt) ? event : best,
      null
    )
  const latest = newest(perLayout.map((entry) => entry.latest))
  return {
    layouts: perLayout.map(({ layoutId, name, latest }) => ({
      layoutId,
      name,
      latest,
    })),
    /** The room's newest event across all its layouts. */
    latest,
    latestAt: latest?.createdAt ?? null,
    /** When the agent last changed any layout (for an "agent active" dot). */
    latestAgentAt:
      newest(perLayout.map((entry) => entry.latestByAgent))?.createdAt ?? null,
  }
}

export type AgentActivity = {
  /** When the agent's latest change landed (ms since epoch). */
  at: number
  layoutId: Id<"layouts">
  roomId: Id<"rooms">
  summary: string
}

/** The agent's latest change anywhere in the app, for the global pill. */
export async function doLatestAgentActivity(
  ctx: QueryCtx
): Promise<AgentActivity | null> {
  const event = await ctx.db
    .query("layoutEvents")
    .withIndex("by_actor", (q) => q.eq("actor", "agent"))
    .order("desc")
    .first()
  if (!event) return null
  const layout = await ctx.db.get(event.layoutId)
  if (!layout) return null
  return {
    at: event.createdAt,
    layoutId: event.layoutId,
    roomId: layout.roomId,
    summary: event.summary,
  }
}

// ---------------------------------------------------------------------------
// Convex function exports
// ---------------------------------------------------------------------------

export const listByRoom = appQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await doListLayouts(ctx, args)
  },
})

export const get = appQuery({
  args: { layoutId: v.id("layouts") },
  handler: async (ctx, args) => {
    return await doGetLayout(ctx, args)
  },
})

export const create = appMutation({
  args: {
    roomId: v.id("rooms"),
    name: vLayoutName,
    notes: v.optional(vLayoutNotes),
    status: v.optional(vLayoutStatus),
    fromLayoutId: v.optional(v.id("layouts")),
    actor: v.optional(vPublicActor),
  },
  handler: async (ctx, args) => {
    return await doCreateLayout(ctx, args)
  },
})

export const update = appMutation({
  args: {
    layoutId: v.id("layouts"),
    name: v.optional(vLayoutName),
    notes: v.optional(vLayoutNotes),
    status: v.optional(vLayoutStatus),
    finishes: v.optional(v.union(vFinishes, v.null())),
    actor: v.optional(vPublicActor),
    expectedRevision: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await doUpdateLayout(ctx, args)
  },
})

export const applyChanges = appMutation({
  args: {
    layoutId: v.id("layouts"),
    ops: v.array(vLayoutOp),
    actor: vPublicActor,
    expectedRevision: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await doApplyChanges(ctx, args)
  },
})

export const remove = appMutation({
  args: { layoutId: v.id("layouts") },
  handler: async (ctx, args) => {
    await doRemoveLayout(ctx, args)
  },
})

export const events = appQuery({
  args: { layoutId: v.id("layouts"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await doListEvents(ctx, args)
  },
})

export const activity = appQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await doRoomActivity(ctx, args)
  },
})

export const latestAgentActivity = appQuery({
  args: {},
  handler: async (ctx) => {
    return await doLatestAgentActivity(ctx)
  },
})

/** Scheduled by room and asset changes; see `scheduleRoomRelint`. */
export const relint = internalMutation({
  args: { layoutId: v.id("layouts"), cause: v.string() },
  handler: async (ctx, args) => {
    await doRelintLayout(ctx, args)
  },
})

/** Maintenance: re-lint every layout (e.g. after the lint rules change). */
export const relintAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await doScheduleRelintAll(ctx)
  },
})

export async function doScheduleRelintAll(ctx: MutationCtx): Promise<number> {
  const layouts = await ctx.db.query("layouts").take(1000)
  return await scheduleRelints(
    ctx,
    layouts.map((l) => l._id),
    "the lint rules changed"
  )
}
