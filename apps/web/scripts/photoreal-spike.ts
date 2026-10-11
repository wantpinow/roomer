/**
 * `pnpm --filter web photoreal:spike [run specs…] [options]` — the photoreal
 * model comparison (docs/2026-10-11-photoreal-spike.md).
 *
 * Renders clay + id passes of the furnished living-room fixture through the
 * running dev server's /render page, maps each test asset to a real Castlery
 * product (seed/castlery/products.json) for its description and cutout
 * photo, then runs the photoreal pipeline for each requested model × input
 * variant at LOW quality. Everything lands in .roomer-out/photoreal-spike/:
 * inputs/ (passes, keyed by content hash so old runs keep theirs), refs/,
 * runs/<id>.png, overlays/<id>.png (the id pass's outlines drawn over the
 * output), results.json and index.html (contact sheet; notes.json adds
 * verdicts to it).
 *
 * Run specs are `camera:model:variant[:tag]`:
 *   camera   door | window | door-wide
 *   model    sunburst | flare | gemini-pro | gemini-flash | flux | stub
 *   variant  full (clay + id + refs) | refs (clay + refs) | clay (clay only)
 *            | room (full + a photo of the real room, see --room-photo)
 * `--matrix` adds every model × variant (bar room) for the door camera.
 *
 * Options: --force (re-run existing outputs), --concurrency N (default 5),
 * --size WxH (default 1248x832), --extra "…" (appended to the prompt),
 * --room-photo <file> (for the room variant; copied into inputs/, which is
 * gitignored), --sheet-only (just rebuild scores and index.html).
 *
 * Every output gets an alignment score: how much stronger the output's edges
 * are along the id pass's outlines than on average (1 ≈ unrelated to the
 * layout; the clay pass itself scores ≈10). It measures "did the camera and
 * the furniture stay put", not beauty.
 *
 * Needs `pnpm dev` running (RENDER_BASE_URL overrides
 * http://localhost:3000) and AI_GATEWAY_API_KEY in the repo-root .env.local.
 * Live runs cost money: keep them few and at low quality.
 */
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import nextEnv from "@next/env"
import {
  type Camera,
  defaultCameras,
  LIVING_ROOM_FINISHES,
  type PhotorealModel,
  type RenderSize,
} from "@roomer/core"
import { PNG } from "pngjs"
import { z } from "zod"

import {
  buildFixtureScene,
  FIXTURE_ASSETS,
  FIXTURE_PLACEMENTS,
  FIXTURE_ROOM,
} from "../lib/scene/fixture-scene"
import { idPassLegend } from "../lib/scene/id-pass"
import { ID_PASS_NON_ITEM_COLORS } from "../lib/scene/palette"
import { closeRenderer, renderScene } from "../server/render/headless-renderer"
import { countPalettePixels } from "../server/render/id-pass"
import {
  describeCameraForPrompt,
  describeRoomForPrompt,
} from "../server/photoreal/describe"
import { isPhotorealError } from "../server/photoreal/errors"
import {
  type GeneratePhotorealResult,
  generatePhotoreal,
  type PhotorealLegendItem,
  type ReferenceImageSource,
} from "../server/photoreal/pipeline"
import { pngSize, sniffImageMime } from "../server/photoreal/png"
import type { Visibility } from "../server/photoreal/references"
import { getImageRenderer } from "../server/photoreal/renderers"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))
// @next/env is CommonJS: under tsx (plain Node ESM) only the default import
// works.
nextEnv.loadEnvConfig(repoRoot, true, {
  info: () => {},
  error: console.error,
})

const OUT = path.join(repoRoot, ".roomer-out", "photoreal-spike")
const PRODUCTS_FILE = path.join(repoRoot, "seed", "castlery", "products.json")

// ---------------------------------------------------------------------------
// The scene: fixture placements, with each test asset standing in for a
// Castlery product (name, description, cutout photo).

type FixtureAssetId = keyof typeof FIXTURE_ASSETS

const PRODUCT_FOR_ASSET: Partial<Record<FixtureAssetId, string>> = {
  "test-sofa": "auburn-3-seater-sofa-chalk-boucle",
  "test-coffee-table": "mori-coffee-table-natural",
  "test-dining-table": "harper-dining-table-180-chestnut-oak",
  "test-dining-chair": "anya-dining-chair-chestnut",
  "test-sideboard": "ashen-wood-sideboard-180",
  "test-rug": "jana-jute-rug-229x274",
}

/** Items with no product: described in words only. */
const GENERIC_ITEMS: Partial<
  Record<FixtureAssetId, { name: string; description: string }>
> = {
  "test-tv": {
    name: "65-inch TV",
    description: "Slim black flat-screen TV mounted on the wall, screen off.",
  },
  "test-pendant": {
    name: "Pendant lamp",
    description:
      "Simple cone-shaped pendant lamp with a cream linen shade on a thin black cord.",
  },
}

/** Castlery's look, condensed to what applies without adding decor. */
const STYLE_NOTES =
  "Castlery-style warm, relaxed modern interior: layered neutrals (chalk, ivory, oat, sand) against warm wood, textured boucle, oak and jute, soft bright daylight with gentle long shadows on warm-white plaster walls. Airy and uncluttered."

const zProducts = z.object({
  products: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      variant: z.string().optional(),
      description: z.string(),
      images: z.array(z.object({ url: z.url(), kind: z.string() })),
    })
  ),
})
type Product = z.infer<typeof zProducts>["products"][number]

/** D1 (the kitchen door) as core's default camera sees it: level, 1.5m, 70°. */
function defaultDoorCamera(): Camera {
  const camera = defaultCameras(FIXTURE_ROOM).find((c) => c.id === "from-d1")
  if (!camera) throw new Error("core's default cameras have no from-d1")
  return camera
}

// Pinned here (not read from the fixture) so reruns stay comparable when the
// fixture's cameras move.
const CAMERAS = {
  /** In the D1 doorway, tilted slightly down, looking to the window. */
  door: {
    id: "spike-door",
    name: "From the kitchen door",
    position: [1550, 1600, 350],
    target: [1150, 1050, 7000],
    fov: 55,
  },
  /** By the window, looking back towards the kitchen door. */
  window: {
    id: "spike-window",
    name: "From the window",
    position: [1900, 1450, 7550],
    target: [1200, 1150, 400],
    fov: 55,
  },
  /** Core's estate-agent default for D1 (level, 1.5m, 70° vertical fov). */
  "door-wide": defaultDoorCamera(),
} as const satisfies Record<string, Camera>
type CameraKey = keyof typeof CAMERAS

const MODELS = {
  sunburst: "openai/gpt-image-2.5-sunburst",
  flare: "openai/gpt-image-2.5-flare",
  "gemini-pro": "google/gemini-3-pro-image",
  "gemini-flash": "google/gemini-3.1-flash-image",
  flux: "bfl/flux-3-image",
  stub: "stub",
} as const satisfies Record<string, PhotorealModel>
type ModelKey = keyof typeof MODELS

const VARIANTS = ["full", "refs", "clay", "room"] as const
type Variant = (typeof VARIANTS)[number]

interface RunSpec {
  id: string
  camera: CameraKey
  model: ModelKey
  variant: Variant
  tag?: string
}

function isKey<T extends object>(
  obj: T,
  key: string
): key is Extract<keyof T, string> {
  return Object.hasOwn(obj, key)
}

function parseSpec(text: string): RunSpec {
  const [camera = "", model = "", variantText = "", tag] = text.split(":")
  const variant = VARIANTS.find((v) => v === variantText)
  if (!isKey(CAMERAS, camera)) throw new Error(`Unknown camera in ${text}`)
  if (!isKey(MODELS, model)) throw new Error(`Unknown model in ${text}`)
  if (!variant) throw new Error(`Unknown variant in ${text}`)
  return {
    id: [camera, model, variant, tag].filter(Boolean).join("-"),
    camera,
    model,
    variant,
    ...(tag ? { tag } : {}),
  }
}

// ---------------------------------------------------------------------------
// CLI

interface Options {
  specs: RunSpec[]
  force: boolean
  concurrency: number
  size: RenderSize
  extra?: string
  roomPhoto?: string
  sheetOnly: boolean
}

function parseArgs(argv: readonly string[]): Options {
  const specs: RunSpec[] = []
  let force = false
  let concurrency = 5
  let size: RenderSize = { width: 1248, height: 832 }
  let extra: string | undefined
  let roomPhoto: string | undefined
  let sheetOnly = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "--force") force = true
    else if (arg === "--sheet-only") sheetOnly = true
    else if (arg === "--concurrency") concurrency = Number(argv[++i])
    else if (arg === "--extra") extra = argv[++i]
    else if (arg === "--room-photo") roomPhoto = argv[++i]
    else if (arg === "--size") {
      const [w, h] = (argv[++i] ?? "").split("x").map(Number)
      size = { width: w!, height: h! }
    } else if (arg === "--matrix") {
      for (const model of Object.keys(MODELS)) {
        if (model === "stub") continue
        for (const variant of VARIANTS) {
          if (variant !== "room")
            specs.push(parseSpec(`door:${model}:${variant}`))
        }
      }
    } else specs.push(parseSpec(arg))
  }
  if (specs.some((s) => s.variant === "room") && !roomPhoto) {
    throw new Error("The room variant needs --room-photo <file>")
  }
  return {
    specs,
    force,
    concurrency,
    size,
    ...(extra ? { extra } : {}),
    ...(roomPhoto ? { roomPhoto } : {}),
    sheetOnly,
  }
}

// ---------------------------------------------------------------------------
// Inputs

const shortHash = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex").slice(0, 8)

/** Cloudinary serves whatever `f_auto` negotiates; ask for a JPEG. */
function jpegUrl(url: string): string {
  return url.replace("f_auto", "f_jpg").replace("w_1200", "w_1024")
}

/** A 3/4 cutout shows depth and legs best; else the first cutout. */
function pickCutout(product: Product): Product["images"][number] {
  const cutouts = product.images.filter((i) => i.kind.startsWith("cutout"))
  return (
    cutouts.find((i) => i.kind === "cutout-angle") ??
    cutouts[0] ??
    product.images[0]!
  )
}

async function downloadReference(product: Product): Promise<string> {
  const dir = path.join(OUT, "refs")
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${product.key}.jpg`)
  if (existsSync(file)) return file
  const response = await fetch(jpegUrl(pickCutout(product).url))
  if (!response.ok) {
    throw new Error(`Downloading ${product.key}: HTTP ${response.status}`)
  }
  const data = Buffer.from(await response.arrayBuffer())
  if (!sniffImageMime(data)) throw new Error(`${product.key}: not an image`)
  await writeFile(file, data)
  return file
}

interface CameraInputs {
  clay: Buffer
  id: Buffer
  /** Paths relative to OUT. */
  clayFile: string
  idFile: string
  visibility: Visibility
  cameraDescription: string
}

async function renderCamera(camera: CameraKey): Promise<CameraInputs> {
  const view = { kind: "camera", camera: CAMERAS[camera] } as const
  const clay = await renderScene(buildFixtureScene({ view }))
  const id = await renderScene(buildFixtureScene({ view, pass: "id" }))
  const key = `${camera}-${shortHash(Buffer.concat([clay, id]))}`
  const clayFile = `inputs/${key}-clay.png`
  const idFile = `inputs/${key}-id.png`
  await mkdir(path.join(OUT, "inputs"), { recursive: true })
  await writeFile(path.join(OUT, clayFile), clay)
  await writeFile(path.join(OUT, idFile), id)

  const legend = idPassLegend(FIXTURE_PLACEMENTS, FIXTURE_ASSETS)
  const counts = countPalettePixels(id, [
    ...legend.map((entry) => entry.hex),
    ...ID_PASS_NON_ITEM_COLORS,
  ])
  if (counts.unmatched > 0) {
    console.warn(`  ${camera}: ${counts.unmatched} id-pass pixels unmatched`)
  }
  const byPlacement = Object.fromEntries(
    legend.map((entry) => [
      entry.placementId,
      counts.colors[entry.hex.toLowerCase()]?.pixels ?? 0,
    ])
  )
  return {
    clay,
    id,
    clayFile,
    idFile,
    visibility: { totalPixels: counts.total, byPlacement },
    cameraDescription: describeCameraForPrompt(CAMERAS[camera], FIXTURE_ROOM),
  }
}

// ---------------------------------------------------------------------------
// Alignment score and overlay

/**
 * Edge contrast of `output` along the id pass's outlines: the mean local max
 * gradient on outline pixels over the mean everywhere. Also returns the
 * output darkened with the outlines drawn on it in magenta.
 */
function alignment(
  output: Buffer,
  id: Buffer
): { score: number; overlay: Buffer } {
  const out = PNG.sync.read(output)
  const ids = PNG.sync.read(id)
  const { width: W, height: H } = out
  const lum = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) {
    lum[i] =
      0.299 * out.data[i * 4]! +
      0.587 * out.data[i * 4 + 1]! +
      0.114 * out.data[i * 4 + 2]!
  }
  const grad = new Float32Array(W * H)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      grad[i] = Math.hypot(lum[i + 1]! - lum[i - 1]!, lum[i + W]! - lum[i - W]!)
    }
  }
  // 5×5 max filter, separable: tolerate a couple of pixels of drift.
  const R = 2
  const rows = new Float32Array(W * H)
  const local = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let m = 0
      for (let k = Math.max(0, x - R); k <= Math.min(W - 1, x + R); k++) {
        m = Math.max(m, grad[y * W + k]!)
      }
      rows[y * W + x] = m
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let m = 0
      for (let k = Math.max(0, y - R); k <= Math.min(H - 1, y + R); k++) {
        m = Math.max(m, rows[k * W + x]!)
      }
      local[y * W + x] = m
    }
  }
  const idAt = (x: number, y: number) => {
    const sx = Math.min(ids.width - 1, Math.floor(((x + 0.5) * ids.width) / W))
    const sy = Math.min(
      ids.height - 1,
      Math.floor(((y + 0.5) * ids.height) / H)
    )
    const i = (sy * ids.width + sx) * 4
    return (ids.data[i]! << 16) | (ids.data[i + 1]! << 8) | ids.data[i + 2]!
  }
  const overlay = new PNG({ width: W, height: H })
  let edgeSum = 0
  let edgeCount = 0
  let allSum = 0
  let allCount = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const c = idAt(x, y)
      const edge =
        (x + 1 < W && idAt(x + 1, y) !== c) ||
        (y + 1 < H && idAt(x, y + 1) !== c)
      if (x >= R && y >= R && x < W - R && y < H - R) {
        allSum += local[i]!
        allCount++
        if (edge) {
          edgeSum += local[i]!
          edgeCount++
        }
      }
      for (let k = 0; k < 3; k++) {
        overlay.data[i * 4 + k] = edge
          ? [255, 0, 200][k]!
          : Math.round(out.data[i * 4 + k]! * 0.8)
      }
      overlay.data[i * 4 + 3] = 255
    }
  }
  const score =
    edgeCount && allSum ? edgeSum / edgeCount / (allSum / allCount) : 0
  return { score, overlay: PNG.sync.write(overlay) }
}

// ---------------------------------------------------------------------------
// Results

interface RunRecord {
  id: string
  camera: CameraKey
  model: PhotorealModel
  variant: Variant
  tag?: string
  clay: string
  idPass: string
  roomPhoto?: string
  output?: string
  overlay?: string
  alignment?: number
  outputSize?: { width: number; height: number }
  durationMs?: number
  costUsd?: number
  error?: { code: string; message: string }
  prompt?: string
  inputs?: GeneratePhotorealResult["inputs"]
  references?: GeneratePhotorealResult["references"]
  skipped?: GeneratePhotorealResult["skipped"]
  finishedAt: string
}

const zResults = z.object({ runs: z.record(z.string(), z.unknown()) })

async function readJson(file: string): Promise<unknown> {
  return existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : undefined
}

async function loadResults(): Promise<Record<string, RunRecord>> {
  const parsed = zResults.safeParse(
    await readJson(path.join(OUT, "results.json"))
  )
  // Records are only ever written by this script; trust their shape.
  return parsed.success ? (parsed.data.runs as Record<string, RunRecord>) : {}
}

async function saveResults(runs: Record<string, RunRecord>): Promise<void> {
  await writeFile(
    path.join(OUT, "results.json"),
    JSON.stringify({ runs }, null, 2)
  )
}

/** `providerMetadata.gateway.cost` ("0.048") → 0.048, if present. */
function gatewayCost(raw: unknown): number | undefined {
  const value: unknown = ["providerMetadata", "gateway", "cost"].reduce(
    (node: unknown, key) =>
      typeof node === "object" && node !== null
        ? Reflect.get(node, key)
        : undefined,
    raw
  )
  const cost = typeof value === "string" ? Number(value) : value
  return typeof cost === "number" && Number.isFinite(cost) ? cost : undefined
}

/** Score (and draw the overlay for) every output that lacks a score. */
async function scoreRuns(runs: Record<string, RunRecord>): Promise<void> {
  await mkdir(path.join(OUT, "overlays"), { recursive: true })
  for (const run of Object.values(runs)) {
    if (!run.output || run.alignment !== undefined) continue
    const output = path.join(OUT, run.output)
    const id = path.join(OUT, run.idPass)
    if (!existsSync(output) || !existsSync(id)) continue
    const { score, overlay } = alignment(
      await readFile(output),
      await readFile(id)
    )
    run.overlay = `overlays/${run.id}.png`
    await writeFile(path.join(OUT, run.overlay), overlay)
    run.alignment = Math.round(score * 100) / 100
  }
}

// ---------------------------------------------------------------------------
// Contact sheet

const esc = (text: string) =>
  text.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  )

async function writeContactSheet(
  runs: Record<string, RunRecord>,
  refs: { key: string; name: string; file: string }[]
): Promise<void> {
  const notes = z
    .record(z.string(), z.string())
    .safeParse(await readJson(path.join(OUT, "notes.json")))
  const note = (id: string) => (notes.success ? notes.data[id] : undefined)
  const modelOrder: string[] = Object.values(MODELS)
  // One section per camera + input set, so old runs sit next to their passes.
  const groups = new Map<string, RunRecord[]>()
  for (const run of Object.values(runs)) {
    const key = `${run.camera}|${run.clay}|${run.idPass}`
    groups.set(key, [...(groups.get(key) ?? []), run])
  }
  const sections = [...groups.values()].map((list) => {
    const first = list[0]!
    list.sort(
      (a, b) =>
        modelOrder.indexOf(a.model) - modelOrder.indexOf(b.model) ||
        VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant) ||
        (a.tag ?? "").localeCompare(b.tag ?? "")
    )
    const cards = list
      .map((r) => {
        const meta = [
          r.alignment !== undefined && `alignment ${r.alignment.toFixed(2)}`,
          r.durationMs !== undefined && `${(r.durationMs / 1000).toFixed(1)}s`,
          r.costUsd !== undefined && `$${r.costUsd.toFixed(3)}`,
          r.outputSize && `${r.outputSize.width}×${r.outputSize.height}`,
        ]
          .filter(Boolean)
          .join(" · ")
        const body = r.output
          ? `<a href="${esc(r.output)}"><img src="${esc(r.output)}" loading="lazy"></a>${r.overlay ? `<a class="overlay" href="${esc(r.overlay)}">layout overlay</a>` : ""}`
          : `<div class="error">${esc(r.error?.code ?? "")}: ${esc(r.error?.message ?? "")}</div>`
        const verdict = note(r.id)
        return `<figure>${body}<figcaption><b>${esc(r.model)}</b> · ${esc(r.variant)}${r.tag ? ` · ${esc(r.tag)}` : ""}<br><small>${esc(r.id)} · ${esc(meta)}</small>${verdict ? `<p>${esc(verdict)}</p>` : ""}</figcaption></figure>`
      })
      .join("\n")
    const roomPhotos = [
      ...new Set(list.flatMap((r) => (r.roomPhoto ? [r.roomPhoto] : []))),
    ]
      .map(
        (file) =>
          `<figure><img src="${esc(file)}"><figcaption>room photo (room variant)</figcaption></figure>`
      )
      .join("\n")
    return `<h2>Camera: ${esc(first.camera)} <small>${esc(path.basename(first.clay))}</small></h2>
<div class="grid inputs">
<figure><img src="${esc(first.clay)}"><figcaption>clay (image 1)</figcaption></figure>
<figure><img src="${esc(first.idPass)}"><figcaption>id map (image 2 in “full”)</figcaption></figure>
${roomPhotos}
</div>
<div class="grid">${cards}</div>`
  })
  const refCards = refs
    .map(
      (r) =>
        `<figure><img src="${esc(path.relative(OUT, r.file))}"><figcaption>${esc(r.name)}</figcaption></figure>`
    )
    .join("\n")
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photoreal spike</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:24px;background:#f6f3ee;color:#2b2722}
h1{font-weight:600}h2{margin-top:40px;border-top:1px solid #d8d0c4;padding-top:16px}h2 small{font-weight:400;color:#8a7f70}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px}
.grid.refs{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
figure{margin:0;background:#fff;border:1px solid #e3dccf;border-radius:6px;overflow:hidden}
img{display:block;width:100%;height:auto}
figcaption{padding:8px 10px}figcaption p{margin:6px 0 0;color:#5a4e40}
.overlay{display:block;padding:4px 10px;font-size:12px;color:#8a3324}
.error{padding:24px;color:#8a3324;min-height:120px}
</style></head><body>
<h1>Photoreal spike — ${new Date().toISOString().slice(0, 10)}</h1>
<p>Living-room fixture, LOW quality. Variants: <b>full</b> = clay + id map + product photos; <b>refs</b> = clay + product photos; <b>clay</b> = clay only (items described in words); <b>room</b> = full + a photo of the real room. <b>Alignment</b> = edge contrast along the clay layout's outlines (≈1 unrelated, ≈10 the clay itself); “layout overlay” shows those outlines over the output.</p>
<h2>Product photos</h2><div class="grid refs">${refCards}</div>
${sections.join("\n")}
</body></html>`
  await writeFile(path.join(OUT, "index.html"), html)
}

// ---------------------------------------------------------------------------

async function pool<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.max(1, limit) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        await work(item)
      }
    })
  )
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await mkdir(path.join(OUT, "runs"), { recursive: true })
  const products = zProducts.parse(
    JSON.parse(await readFile(PRODUCTS_FILE, "utf8"))
  ).products
  const productByKey = new Map(products.map((p) => [p.key, p]))

  // Legend items and reference sources per fixture asset.
  const refFiles: { key: string; name: string; file: string }[] = []
  const references: Record<string, ReferenceImageSource[]> = {}
  const itemInfo = new Map<string, { name: string; description?: string }>()
  for (const assetId of Object.keys(FIXTURE_ASSETS) as FixtureAssetId[]) {
    const key = PRODUCT_FOR_ASSET[assetId]
    const product = key ? productByKey.get(key) : undefined
    if (key && !product) throw new Error(`No product ${key} in products.json`)
    if (product) {
      const file = await downloadReference(product)
      refFiles.push({ key: product.key, name: product.name, file })
      itemInfo.set(assetId, {
        name: product.name,
        description: `${product.variant ? `${product.variant}. ` : ""}${product.description}`,
      })
      references[assetId] = [
        {
          primary: true,
          load: async () => {
            const data = await readFile(file)
            return { data, mime: sniffImageMime(data) ?? "image/jpeg" }
          },
        },
      ]
    } else {
      const generic = GENERIC_ITEMS[assetId]
      itemInfo.set(assetId, generic ?? { name: FIXTURE_ASSETS[assetId].name })
    }
  }
  const legend: PhotorealLegendItem[] = idPassLegend(
    FIXTURE_PLACEMENTS,
    FIXTURE_ASSETS
  ).map((entry) => {
    const info = itemInfo.get(entry.assetId) ?? { name: entry.label }
    return {
      placementId: entry.placementId,
      assetId: entry.assetId,
      name: info.name,
      ...(info.description ? { description: info.description } : {}),
      colorName: entry.colorName,
    }
  })

  // The room photo is the user's: it stays in the gitignored output folder.
  let roomPhotoFile: string | undefined
  if (options.roomPhoto) {
    const data = await readFile(options.roomPhoto)
    const ext = path.extname(options.roomPhoto) || ".img"
    roomPhotoFile = `inputs/room-photo-${shortHash(data)}${ext}`
    await copyFile(options.roomPhoto, path.join(OUT, roomPhotoFile))
  }

  const results = await loadResults()
  if (!options.sheetOnly) {
    const todo = options.specs.filter(
      (spec) =>
        options.force ||
        !results[spec.id]?.output ||
        !existsSync(path.join(OUT, results[spec.id]!.output!))
    )
    console.log(
      `${options.specs.length} runs requested, ${todo.length} to do (${options.specs.length - todo.length} cached)`
    )
    const cameras = [...new Set(todo.map((spec) => spec.camera))]
    const inputs = new Map<CameraKey, CameraInputs>()
    for (const camera of cameras) {
      console.log(`rendering ${camera} passes…`)
      inputs.set(camera, await renderCamera(camera))
    }
    await closeRenderer()

    const apiKey = process.env.AI_GATEWAY_API_KEY
    const roomSummary = describeRoomForPrompt({
      ...FIXTURE_ROOM,
      name: "Living and dining room",
    })
    await pool(todo, options.concurrency, async (spec) => {
      const camera = inputs.get(spec.camera)!
      const model = MODELS[spec.model]
      const started = Date.now()
      const withRoomPhoto = spec.variant === "room" && roomPhotoFile
      const record: RunRecord = {
        id: spec.id,
        camera: spec.camera,
        model,
        variant: spec.variant,
        ...(spec.tag ? { tag: spec.tag } : {}),
        clay: camera.clayFile,
        idPass: camera.idFile,
        ...(withRoomPhoto ? { roomPhoto: roomPhotoFile } : {}),
        finishedAt: "",
      }
      try {
        const renderer = getImageRenderer(model, apiKey ? { apiKey } : {})
        const result = await generatePhotoreal({
          renderer,
          clay: camera.clay,
          // Variants pin the id map on or off whatever the model prefers.
          id: camera.id,
          idPass:
            spec.variant === "full" || spec.variant === "room"
              ? "send"
              : "omit",
          legend,
          visibility: camera.visibility,
          references: spec.variant === "clay" ? {} : references,
          ...(withRoomPhoto
            ? {
                roomPhotos: [
                  {
                    load: async () => {
                      const data = await readFile(path.join(OUT, withRoomPhoto))
                      return {
                        data,
                        mime: sniffImageMime(data) ?? "image/webp",
                      }
                    },
                  },
                ],
              }
            : {}),
          finishes: { ...LIVING_ROOM_FINISHES, notes: STYLE_NOTES },
          roomSummary,
          cameraDescription: camera.cameraDescription,
          quality: "low",
          size: options.size,
          ...(options.extra ? { extraPrompt: options.extra } : {}),
        })
        const output = `runs/${spec.id}.png`
        await writeFile(path.join(OUT, output), result.png)
        const cost = gatewayCost(result.raw)
        const outputSize = pngSize(result.png)
        Object.assign(record, {
          output,
          ...(outputSize ? { outputSize } : {}),
          durationMs: result.durationMs,
          ...(cost === undefined ? {} : { costUsd: cost }),
          prompt: result.prompt,
          inputs: result.inputs,
          references: result.references,
          skipped: result.skipped,
        })
        console.log(
          `  ✓ ${spec.id}: ${(result.durationMs / 1000).toFixed(1)}s${cost === undefined ? "" : `, $${cost.toFixed(3)}`}`
        )
      } catch (error) {
        record.durationMs = Date.now() - started
        record.error = isPhotorealError(error)
          ? { code: error.code, message: error.message }
          : { code: "SCRIPT", message: String(error) }
        console.log(
          `  ✗ ${spec.id}: ${record.error.code} ${record.error.message}`
        )
      }
      record.finishedAt = new Date().toISOString()
      results[spec.id] = record
      await saveResults(results)
    })
  }

  await scoreRuns(results)
  await saveResults(results)
  await writeContactSheet(results, refFiles)
  const done = Object.values(results)
  const spend = done.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)
  for (const run of done.filter((r) => r.alignment !== undefined)) {
    console.log(`  ${run.alignment!.toFixed(2)}  ${run.id}`)
  }
  console.log(
    `\n${done.length} runs on record, ${done.filter((r) => r.error).length} failed, ≈$${spend.toFixed(2)} gateway cost`
  )
  console.log(`contact sheet: ${path.join(OUT, "index.html")}`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => closeRenderer())
