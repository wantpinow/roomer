import {
  bearingOf,
  formatDegrees,
  formatNumber,
  normalizeBearing,
} from "@roomer/core/geometry"
import type {
  Camera,
  Dims,
  Feature,
  Finishes,
  LintIssue,
  LintReport,
  LintSeverity,
  ShellSolve,
} from "@roomer/core/schema"

import { formatPrice } from "@/lib/format/price"
import type { IdPassLegendEntry } from "@/lib/scene/id-pass"

import type {
  AssetDetail,
  AssetSummary,
  LayoutDetail,
  LayoutSummary,
  RenderRecord,
  RoomDetail,
  RoomSummary,
} from "../convex"

// Text for the agent. Every tool answers with a compact, information-dense
// block: ids it will need next, sizes in whole millimetres with units,
// bearings with a plain direction word, lint errors first with their hints.
// Pure functions of backend data, unit-tested.

// ---------------------------------------------------------------------------
// Units and small pieces
// ---------------------------------------------------------------------------

/** 2150 → "2,150mm". */
export function mm(value: number): string {
  return `${formatNumber(Math.round(value))}mm`
}

/** 2150 → "2,150" (for lists where the unit is stated once). */
export function n(value: number): string {
  return formatNumber(Math.round(value))
}

/** "2,200W × 950D × 820H mm". */
export function dims(d: Dims): string {
  return `${n(d.w)}W × ${n(d.d)}D × ${n(d.h)}H mm`
}

/** Plan point "(1,490, 2,400)". */
export function point(x: number, z: number): string {
  return `(${n(x)}, ${n(z)})`
}

const COMPASS = [
  "up",
  "up-right",
  "right",
  "down-right",
  "down",
  "down-left",
  "left",
  "up-left",
] as const

/** Nearest of eight plan directions: 0 → "up", 90 → "right", … */
export function bearingWord(bearing: number): string {
  const b = normalizeBearing(bearing)
  return COMPASS[Math.round(b / 45) % 8]!
}

/** "90° (right)"; off-axis bearings get "≈": "93° (≈right)". */
export function bearing(value: number): string {
  const b = normalizeBearing(value)
  const exact = Math.abs(b - Math.round(b / 45) * 45) < 0.5
  return `${formatDegrees(b)} (${exact ? "" : "≈"}${bearingWord(b)})`
}

const SIDE_OF_PLAN: Record<(typeof COMPASS)[number], string> = {
  up: "bottom",
  "up-right": "bottom-left",
  right: "left",
  "down-right": "top-left",
  down: "top",
  "down-left": "top-right",
  left: "right",
  "up-left": "bottom-right",
}

/** Where a wall sits on the plan, from the way it faces: 180 → "top wall". */
export function wallSide(inwardBearing: number): string {
  const word = COMPASS[Math.round(normalizeBearing(inwardBearing) / 45) % 8]!
  return `${SIDE_OF_PLAN[word]} wall`
}

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`
}

function quote(text: string): string {
  return `"${text}"`
}

/** Short id for long lists: the whole id, it's what the agent passes back. */
function idTag(id: string): string {
  return `id ${id}`
}

/** UTC timestamp, minute precision: "2026-10-11 19:15Z". */
export function timestamp(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")}Z`
}

/** "42s", "1m 05s", "850ms". */
export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`
}

/** Overall plan extent of an outline: "2,980 × 7,690mm (x × z)". */
export function outlineSize(corners: readonly (readonly number[])[]): string {
  const xs = corners.map((c) => c[0] ?? 0)
  const zs = corners.map((c) => c[1] ?? 0)
  const width = Math.max(...xs) - Math.min(...xs)
  const depth = Math.max(...zs) - Math.min(...zs)
  return `${n(width)} × ${mm(depth)} (x × z)`
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export interface PriceLike {
  amount: number
  currency: string | null
  mixedCurrencies: boolean
  unpricedItems: number
}

/** "£1,234", "£1,234 (+2 unpriced)", "no prices", "1,234 (mixed currencies)". */
export function price(p: PriceLike, itemCount: number): string {
  if (itemCount === 0) return "£0"
  if (p.unpricedItems === itemCount) return "no prices"
  const total = p.mixedCurrencies
    ? `${n(p.amount)} (mixed currencies)`
    : formatPrice(p.amount, p.currency ?? undefined)
  return p.unpricedItems > 0 ? `${total} (+${p.unpricedItems} unpriced)` : total
}

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------

const SEVERITY_HEADINGS: Record<LintSeverity, string> = {
  error: "Errors (must fix)",
  warning: "Warnings (fix, or accept and say why in the layout notes)",
  info: "Info",
}

/** "1 error, 2 warnings, 0 info". */
export function lintCounts(counts: LintReport["counts"]): string {
  return `${plural(counts.error, "error")}, ${plural(counts.warning, "warning")}, ${counts.info} info`
}

function issueLine(issue: LintIssue): string {
  const who = [...issue.placementIds, ...issue.featureIds]
  const subject = who.length > 0 ? ` [${who.join(", ")}]` : ""
  const hint = issue.hint ? ` → ${issue.hint}` : ""
  return `- ${issue.code}${subject} ${issue.message}${hint}`
}

/**
 * The lint report, errors first. Every error and warning is listed; info
 * notes are capped at `maxInfo` (they are hints, not problems).
 */
export function lintReport(
  report: LintReport,
  { maxInfo = 8 }: { maxInfo?: number } = {}
): string {
  const { counts } = report
  if (report.issues.length === 0) {
    return `Lint: clean (${lintCounts(counts)}).`
  }
  const lines = [
    `Lint: ${lintCounts(counts)}${counts.error > 0 ? " — fix every error." : "."}`,
  ]
  for (const severity of ["error", "warning", "info"] as const) {
    const issues = report.issues.filter((i) => i.severity === severity)
    if (issues.length === 0) continue
    lines.push(`${SEVERITY_HEADINGS[severity]}:`)
    const shown = severity === "info" ? issues.slice(0, maxInfo) : issues
    lines.push(...shown.map(issueLine))
    if (shown.length < issues.length) {
      lines.push(`- … and ${issues.length - shown.length} more info notes`)
    }
  }
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export function solveReport(solve: ShellSolve): string {
  const angles = solve.cornerAngles
    .map((angle, i) => `C${i + 1} ${formatDegrees(angle)}`)
    .join(", ")
  const residual =
    solve.residualMm > 15
      ? `residual ${mm(solve.residualMm)} — over 15mm, re-measure`
      : `residual ${mm(solve.residualMm)}`
  const lines = [
    `Solved by ${solve.method}; ${residual}. Corner angles: ${angles}.`,
  ]
  for (const warning of solve.warnings) lines.push(`Solver warning: ${warning}`)
  return lines.join("\n")
}

export function corners(list: readonly (readonly [number, number])[]): string {
  return list.map(([x, z], i) => `C${i + 1} ${point(x, z)}`).join(" · ")
}

type WallSummary = RoomDetail["walls"][number]

export function wallLine(wall: WallSummary): string {
  return `- ${wall.id} ${wall.startCorner}→${wall.endCorner} ${mm(wall.length)} · ${wallSide(wall.inwardBearing)}, faces ${bearing(wall.inwardBearing)}`
}

function label(feature: { label?: string | undefined }): string {
  return feature.label ? ` ${quote(feature.label)}` : ""
}

function assumed(feature: { assumed?: boolean | undefined }): string {
  return feature.assumed ? " [assumed]" : ""
}

function along(feature: {
  wall: string
  offset: number
  width: number
}): string {
  return `on ${feature.wall}, ${n(feature.offset)}–${mm(feature.offset + feature.width)} along`
}

function hingeSide(
  feature: { wall: string; hinge: "start" | "end" },
  walls: readonly WallSummary[]
): string {
  const wall = walls.find((w) => w.id === feature.wall)
  const corner = wall
    ? feature.hinge === "start"
      ? wall.startCorner
      : wall.endCorner
    : undefined
  return corner
    ? `hinged on the ${corner} side`
    : `hinged at the ${feature.hinge}`
}

const SWING_WORDS = {
  in: "opens into the room (keep its swing clear)",
  out: "opens away from the room",
  none: "no door leaf",
} as const

/** One line per feature, worded for its type. */
export function featureLine(
  feature: Feature,
  walls: readonly WallSummary[] = []
): string {
  const head = `- ${feature.id}${label(feature)}`
  const tail = assumed(feature)
  switch (feature.type) {
    case "door":
      return `${head} door ${along(feature)} (${mm(feature.width)} wide${feature.leaves === 2 ? ", double" : ""}, ${mm(feature.height)} high), ${hingeSide(feature, walls)}, ${SWING_WORDS[feature.swing]}${tail}`
    case "window":
      return `${head} window ${along(feature)} (${mm(feature.width)} wide), sill at ${mm(feature.bottom)}, ${mm(feature.height)} high, opens ${feature.opens}${feature.sillDepth ? `, sill sticks out ${mm(feature.sillDepth)}` : ""}${tail}`
    case "opening":
      return `${head} doorless opening ${along(feature)} (${mm(feature.width)} wide, ${mm(feature.height)} high)${tail}`
    case "radiator":
      return `${head} radiator ${along(feature)}, ${n(feature.bottom)}–${mm(feature.bottom + feature.height)} high, sticks out ${mm(feature.depth)}${tail}`
    case "obstacle":
      return `${head} ${feature.kind} ${along(feature)}, sticks out ${mm(feature.depth)}, ${n(feature.bottom)}–${mm(feature.bottom + feature.height)} high${tail}`
    case "socket":
    case "switch":
      return `${head} ${feature.gang === 2 ? "double " : ""}${feature.type} ${along(feature)}, ${mm(feature.bottom)} up${tail}`
    case "data":
    case "aerial":
    case "wall-light":
      return `${head} ${feature.type} ${along(feature)}, ${mm(feature.bottom)} up${tail}`
    case "hearth":
    case "floor-socket":
    case "floor-obstacle":
      return `${head} ${feature.type} centred at ${point(feature.x, feature.z)}, ${n(feature.width)} × ${n(feature.depth)} × ${mm(feature.height)} (w × d × h)${feature.facing !== undefined ? `, facing ${bearing(feature.facing)}` : ""}${tail}`
    case "pendant":
      return `${head} pendant fitting at ${point(feature.x, feature.z)}${feature.drop !== undefined ? `, drop ${mm(feature.drop)}` : ""}${tail}`
    case "ceiling-light":
    case "spotlight":
    case "smoke-alarm":
      return `${head} ${feature.type} at ${point(feature.x, feature.z)}${tail}`
    case "beam":
      return `${head} ceiling beam from ${point(...feature.start)} to ${point(...feature.end)}, ${mm(feature.width)} wide, hangs ${mm(feature.drop)} below the ceiling${tail}`
    default:
      return `${head} ${(feature satisfies never as Feature).type}${tail}`
  }
}

const FEATURE_GROUPS: { title: string; types: readonly Feature["type"][] }[] = [
  { title: "Doors & openings", types: ["door", "opening"] },
  { title: "Windows", types: ["window"] },
  { title: "Radiators", types: ["radiator"] },
  { title: "Obstacles", types: ["obstacle", "hearth", "floor-obstacle"] },
  {
    title: "Sockets, switches & points",
    types: ["socket", "switch", "data", "aerial", "wall-light", "floor-socket"],
  },
  {
    title: "Ceiling",
    types: ["pendant", "ceiling-light", "spotlight", "smoke-alarm", "beam"],
  },
]

export function featureGroups(
  features: readonly Feature[],
  walls: readonly WallSummary[] = []
): string {
  if (features.length === 0) return "Features: none yet."
  const lines = [`Features (${features.length}):`]
  for (const group of FEATURE_GROUPS) {
    const members = features.filter((f) => group.types.includes(f.type))
    if (members.length === 0) continue
    lines.push(`${group.title}:`)
    lines.push(...members.map((f) => featureLine(f, walls)))
  }
  const grouped = new Set(FEATURE_GROUPS.flatMap((g) => g.types))
  const others = features.filter((f) => !grouped.has(f.type))
  if (others.length > 0) {
    lines.push("Other:", ...others.map((f) => featureLine(f, walls)))
  }
  return lines.join("\n")
}

/** Where a camera looks: plan bearing and tilt. */
export function cameraLine(camera: Camera): string {
  const [px, py, pz] = camera.position
  const [tx, ty, tz] = camera.target
  const run = Math.hypot(tx - px, tz - pz)
  const tilt = (Math.atan2(py - ty, run) * 180) / Math.PI
  const tiltText =
    Math.abs(tilt) < 1
      ? "level"
      : `tilted ${Math.round(Math.abs(tilt))}° ${tilt > 0 ? "down" : "up"}`
  const heading =
    run > 0 ? bearing(bearingOf([tx - px, tz - pz])) : "straight down"
  const lens = camera.projection === "fisheye" ? ", fisheye" : ""
  return `- ${camera.id} ${quote(camera.name)}: eye at (${n(px)}, ${n(py)}, ${n(pz)}) looking ${heading}, ${tiltText}, fov ${formatDegrees(camera.fov)}${lens}`
}

const FINISH_ORDER = ["walls", "floor", "ceiling", "skirting", "notes"] as const

export function finishes(f: Finishes | undefined): string {
  const entries = FINISH_ORDER.flatMap((key) => {
    const value = f?.[key]
    return value ? [`${key} ${quote(value)}`] : []
  })
  return entries.length === 0 ? "none" : entries.join("; ")
}

export function roomDetail(room: RoomDetail): string {
  const { shell } = room
  return [
    `Room ${quote(room.name)} — ${idTag(room._id)}`,
    `Outline: ${plural(shell.corners.length, "corner")}, ${outlineSize(shell.corners)} overall; ceiling ${mm(room.ceilingHeight)}; skirting ${mm(room.skirting.height)} high × ${mm(room.skirting.depth)} deep.`,
    solveReport(shell.solve),
    `Corners (x, z mm): ${corners(shell.corners)}`,
    "",
    `Walls (Wi runs Ci → Ci+1; "faces" = the way its surface faces into the room; positions along a wall are measured from its start corner):`,
    ...room.walls.map(wallLine),
    "",
    featureGroups(room.features, room.walls),
    "",
    `Cameras (${room.cameras.length}):`,
    ...(room.cameras.length > 0 ? room.cameras.map(cameraLine) : ["- none"]),
    "",
    `Finishes: ${finishes(room.finishes)}`,
    `Reference photos: ${room.referencePhotos.length}`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Overview and layout lists
// ---------------------------------------------------------------------------

export function layoutLine(layout: LayoutSummary): string {
  return `- ${quote(layout.name)} — ${idTag(layout._id)} · ${layout.status} · rev ${layout.revision} · ${plural(layout.placementCount, "item")} · ${price(layout.price, layout.placementCount)} · lint ${lintCounts(layout.lintCounts)}${layout.parentId ? ` · forked from ${layout.parentId}` : ""}`
}

export function layoutList(layouts: readonly LayoutSummary[]): string {
  if (layouts.length === 0) {
    return "Layouts: none yet — create one with create_layout."
  }
  return [`Layouts (${layouts.length}):`, ...layouts.map(layoutLine)].join("\n")
}

function assetCounts(assets: readonly AssetSummary[]): string {
  if (assets.length === 0) {
    return "Assets: none yet — build one with create_asset."
  }
  const bySource = { library: 0, custom: 0 }
  const byCategory = new Map<string, number>()
  for (const asset of assets) {
    bySource[asset.source]++
    byCategory.set(asset.category, (byCategory.get(asset.category) ?? 0) + 1)
  }
  const categories = [...byCategory]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => `${category} ${count}`)
    .join(", ")
  return `Assets: ${assets.length} (${bySource.library} library, ${bySource.custom} custom) — ${categories}. Browse with search_assets.`
}

export function overview(
  rooms: readonly {
    room: Pick<RoomSummary, "_id" | "name" | "corners" | "featureCount">
    layouts: readonly LayoutSummary[]
  }[],
  assets: readonly AssetSummary[]
): string {
  const lines = [
    `Roomer: ${plural(rooms.length, "room")}, ${plural(assets.length, "asset")}.`,
  ]
  if (rooms.length === 0) {
    lines.push("", "No rooms yet — create one with create_room.")
  }
  for (const { room, layouts } of rooms) {
    lines.push(
      "",
      `Room ${quote(room.name)} — ${idTag(room._id)} · ${outlineSize(room.corners)}, ${plural(room.corners.length, "wall")}, ${plural(room.featureCount, "feature")}`,
      layoutList(layouts)
    )
  }
  lines.push(
    "",
    assetCounts(assets),
    "",
    "Next: get_room for walls, features and cameras; get_layout for placements and lint; render_plan to see either."
  )
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

function productPrice(product: AssetSummary["product"]): string | null {
  return product?.price !== undefined
    ? formatPrice(product.price, product.currency)
    : null
}

export function assetLine(asset: AssetSummary): string {
  const bits = [
    asset.key,
    quote(asset.name),
    `${asset.category}, ${asset.mount}`,
    dims(asset.dims),
    productPrice(asset.product),
    asset.source,
    `${plural(asset.images.length, "photo")}, ${plural(asset.previews.length, "preview")}`,
    idTag(asset._id),
  ]
  return `- ${bits.filter((bit) => bit !== null).join(" · ")}`
}

export function assetList(
  assets: readonly AssetSummary[],
  { total }: { total?: number } = {}
): string {
  if (assets.length === 0) {
    return "No assets match. Loosen the filters, or build one with create_asset."
  }
  const more =
    total !== undefined && total > assets.length
      ? ` (showing ${assets.length} of ${total}; raise limit to see more)`
      : ""
  return [
    `${plural(assets.length, "asset")}${more} — key · name · category, mount · size · price · source · photos · id:`,
    ...assets.map(assetLine),
  ].join("\n")
}

/** The parts' bounding box against the listed dims. */
export function boundsLine(
  bounds: { min: readonly number[]; max: readonly number[] },
  listed: Dims
): string {
  const [x0 = 0, y0 = 0, z0 = 0] = bounds.min
  const [x1 = 0, y1 = 0, z1 = 0] = bounds.max
  const size = { w: x1 - x0, h: y1 - y0, d: z1 - z0 }
  const off = (["w", "d", "h"] as const).filter(
    (axis) => Math.abs(size[axis] - listed[axis]) >= 1
  )
  const match =
    off.length === 0
      ? "matches the listed dims"
      : `listed ${dims(listed)}; differs in ${off.join(", ")} (allowed ±10mm)`
  return `Parts' bounding box: ${dims(size)} — x ${n(x0)}…${n(x1)}, y ${n(y0)}…${n(y1)}, z ${n(z0)}…${n(z1)}; ${match}.`
}

function partShapes(parts: AssetDetail["geometry"]["parts"]): string {
  const shown = parts.slice(0, 24).map((part) => `${part.name} (${part.shape})`)
  const more =
    parts.length > shown.length ? `, … +${parts.length - shown.length}` : ""
  return `${shown.join(", ")}${more}`
}

export function assetDetail(
  asset: AssetDetail,
  { includeParts = false }: { includeParts?: boolean } = {}
): string {
  const lines = [
    `Asset ${quote(asset.name)} — key ${asset.key} · ${idTag(asset._id)}`,
    `${asset.category} · mount ${asset.mount} · ${asset.source}`,
    `Size: ${dims(asset.dims)}${asset.product ? ` (dims from ${asset.product.dimsSource})` : ""}`,
  ]
  if (asset.clearance) {
    const clearance = asset.clearance
    const clear = (["front", "back", "left", "right"] as const).flatMap(
      (side) => {
        const value = clearance[side]
        return value === undefined ? [] : [`${side} ${mm(value)}`]
      }
    )
    if (clear.length > 0) lines.push(`Clearance: ${clear.join(", ")}`)
  }
  if (asset.description) lines.push(`Description: ${asset.description}`)
  if (asset.product) {
    const p = asset.product
    lines.push(
      `Product: ${[p.url, p.retailer, p.variant ? quote(p.variant) : undefined, productPrice(p)].filter(Boolean).join(" · ")}`
    )
  }
  if (asset.tags?.length) lines.push(`Tags: ${asset.tags.join(", ")}`)
  const { parts } = asset.geometry
  lines.push(
    `Model: ${plural(parts.length, "part")} — ${partShapes(parts)}.${includeParts ? "" : " Pass includeParts: true for the parts JSON (to edit with update_asset)."}`
  )
  if (asset.imageUrls.length === 0) {
    lines.push("Photos: none — add 1–3 with add_asset_images.")
  } else {
    lines.push(`Photos (${asset.imageUrls.length}):`)
    asset.imageUrls.forEach((image, i) => {
      lines.push(
        `${i + 1}. ${image.primary ? "[primary] " : ""}${image.url ?? "(missing file)"}${image.sourceUrl ? ` (from ${image.sourceUrl})` : ""}`
      )
    })
  }
  lines.push(
    asset.previewUrls.length === 0
      ? "Previews: none — preview_asset renders them."
      : `Previews: ${asset.previewUrls.map((p) => `${p.view} ${p.url ?? "(missing)"}`).join(" · ")}`
  )
  if (includeParts) {
    lines.push("", "Parts JSON:", JSON.stringify(parts))
  }
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

export function placementLine(
  placement: LayoutDetail["placements"][number],
  layout: Pick<LayoutDetail, "assets" | "relations">
): string {
  const asset = layout.assets[placement.assetId]
  const name = asset
    ? `${asset.name} [${asset.key}]`
    : `missing asset ${placement.assetId}`
  const size = asset ? ` ${dims(asset.dims)}` : ""
  const title = placement.label ? `${quote(placement.label)} ` : ""
  const where = layout.relations[placement.id]?.facingDescription
  const extras = [
    placement.elevation > 0 ? `bottom ${mm(placement.elevation)} up` : null,
    placement.mirrored ? "mirrored" : null,
  ].filter(Boolean)
  return [
    `- ${placement.id}: ${title}${name}${size}`,
    `    at ${point(placement.x, placement.z)} facing ${bearing(placement.facing)}${extras.length ? ` · ${extras.join(" · ")}` : ""}${where ? ` · ${where}` : ""}`,
  ].join("\n")
}

export function layoutDetail(layout: LayoutDetail, roomName?: string): string {
  const lines = [
    `Layout ${quote(layout.name)} — ${idTag(layout._id)} · room ${roomName ? `${quote(roomName)} ` : ""}${layout.roomId} · ${layout.status} · revision ${layout.revision}${layout.parentId ? ` · forked from ${layout.parentId}` : ""}`,
  ]
  if (layout.notes) lines.push(`Notes: ${layout.notes}`)
  if (layout.finishes) {
    lines.push(`Finishes override: ${finishes(layout.finishes)}`)
  }
  const count = layout.placements.length
  if (count === 0) {
    lines.push("Items: none yet — add some with apply_changes.")
  } else {
    lines.push(
      `Items (${count}) · total ${price(layout.price, count)} · positions are footprint centres (x, z mm):`
    )
    lines.push(...layout.placements.map((p) => placementLine(p, layout)))
  }
  lines.push(lintReport(layout.lint))
  return lines.join("\n")
}

export function changeList(
  changes: readonly { summary: string }[],
  revision: number
): string {
  return [
    `Applied ${plural(changes.length, "change")} → revision ${revision}.`,
    ...changes.map((change) => `- ${change.summary}`),
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Renders
// ---------------------------------------------------------------------------

/** "red (#e6194b): sofa — Generic sofa — 18.4% of the frame". */
export function idLegend(
  legend: readonly IdPassLegendEntry[],
  shares: Readonly<Record<string, number>>
): string {
  if (legend.length === 0) return "Id pass: no items to colour."
  const lines = [
    "Id pass colours (one flat colour per item; share of the frame):",
  ]
  for (const entry of legend) {
    const share = shares[entry.placementId] ?? 0
    const name =
      entry.assetName && entry.assetName !== entry.label
        ? `${entry.label} (${entry.assetName})`
        : entry.label
    const seen =
      share > 0
        ? `${(share * 100).toFixed(share < 0.001 ? 2 : 1)}%`
        : "not visible from here"
    lines.push(
      `- ${entry.colorName} ${entry.hex}: ${entry.placementId} — ${name} — ${seen}`
    )
  }
  return lines.join("\n")
}

export function renderLine(
  render: RenderRecord,
  currentRevision?: number
): string {
  const model =
    render.kind === "photoreal"
      ? ` · ${render.model ?? "?"}${render.quality ? ` (${render.quality})` : ""}`
      : ""
  const revision =
    currentRevision !== undefined && currentRevision !== render.layoutRevision
      ? `rev ${render.layoutRevision} (layout is now at ${currentRevision})`
      : `rev ${render.layoutRevision}`
  const status =
    render.status === "failed"
      ? `failed: ${render.error ?? "unknown error"}`
      : render.status
  const bits = [
    `- ${render._id}`,
    `${render.kind}${model}`,
    status,
    `camera ${render.view.id}`,
    revision,
    render.durationMs !== undefined ? duration(render.durationMs) : null,
    timestamp(render.createdAt),
    render.outputUrl ? render.outputUrl : null,
  ]
  return bits.filter((bit) => bit !== null).join(" · ")
}

export function renderList(
  renders: readonly RenderRecord[],
  currentRevision?: number
): string {
  if (renders.length === 0) {
    return "No renders yet — render_photoreal makes one."
  }
  return [
    `Renders (${renders.length}, newest first):`,
    ...renders.map((r) => renderLine(r, currentRevision)),
  ].join("\n")
}
