/**
 * Seeds the local dev deployment (start `pnpm dev` first).
 *
 *   pnpm seed                  the living room, the generic starter library
 *                              and a "Starter" layout; only adds what's missing
 *   pnpm seed --refresh        also bring an existing living room back in line
 *                              with its fixture (keeps its id and layouts)
 *   pnpm seed --import [path]  upsert the design data in seed/roomer.json (or
 *                              `path`, relative to the repo root): rooms by
 *                              name, assets by key, layouts by room + name;
 *                              then download missing product photos and
 *                              render missing previews
 *   pnpm seed --previews       render previews for assets that have none
 *                              (needs the web app on :3000)
 *
 * Internal functions run through the Convex CLI against the deployment
 * `convex dev` wrote to .env.local, like masterguest's seed script.
 */
import { readFileSync } from "node:fs"
import { relative } from "node:path"

import { ConvexHttpClient } from "convex/browser"

import { api, internal } from "../convex/_generated/api"
import type { ImportedAsset } from "../convex/seedData"
import { zSeedFile, type SeedAsset, type SeedFile } from "../convex/seedFile"
import {
  convexRun,
  DEFAULT_SEED_FILE,
  devDeployment,
  repoPath,
  repoRoot,
  WEB_URL,
  webIsUp,
} from "./dev-deployment"

/** Keep each `convex run` argument well under the OS's argv limit. */
const MAX_CHUNK_CHARS = 200_000

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

function runSeed(refresh: boolean) {
  const result = convexRun(internal.seed.run, { refresh })
  const { created } = result
  console.log(
    created.room
      ? `✔ created room ${result.roomId}`
      : `• room ${result.roomId} already there`
  )
  console.log(
    created.assets.length > 0
      ? `✔ created ${plural(created.assets.length, "library asset")} (${created.assets.join(", ")})`
      : `• ${plural(Object.keys(result.assetIds).length, "library asset")} already there`
  )
  console.log(
    created.layout
      ? `✔ created layout "Starter" ${result.layoutId}`
      : `• layout "Starter" ${result.layoutId} already there`
  )
  if (result.refreshed) {
    console.log(
      result.refreshed.length > 0
        ? `✔ refreshed the room from the fixture:\n${result.refreshed.map((line) => `    ${line}`).join("\n")}`
        : "• room already matches the fixture"
    )
  }
}

function readSeedFile(path: string): SeedFile {
  const parsed = zSeedFile.safeParse(JSON.parse(readFileSync(path, "utf8")))
  if (!parsed.success) {
    throw new Error(
      `${relative(repoRoot, path)} isn't a valid seed file:\n${parsed.error.issues
        .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}`
    )
  }
  return parsed.data
}

/** Split assets into batches whose JSON stays under MAX_CHUNK_CHARS. */
function chunks(assets: readonly SeedAsset[]): SeedAsset[][] {
  const batches: SeedAsset[][] = []
  let batch: SeedAsset[] = []
  let size = 0
  for (const asset of assets) {
    const length = JSON.stringify(asset).length
    if (batch.length > 0 && size + length > MAX_CHUNK_CHARS) {
      batches.push(batch)
      batch = []
      size = 0
    }
    batch.push(asset)
    size += length
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}

function tally(statuses: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const status of statuses)
    counts.set(status, (counts.get(status) ?? 0) + 1)
  return [...counts].map(([status, n]) => `${n} ${status}`).join(", ") || "none"
}

async function downloadPhotos(
  client: ConvexHttpClient,
  file: SeedFile,
  imported: readonly ImportedAsset[]
) {
  const wanted = imported.filter((asset) => asset.needsImages)
  if (wanted.length === 0) return
  console.log(
    `Downloading product photos for ${plural(wanted.length, "asset")}…`
  )
  for (const asset of wanted) {
    const images = file.assets.find((a) => a.key === asset.key)?.images ?? []
    const primaryIndex = images.findIndex((image) => image.primary)
    try {
      const { results } = await client.action(api.assets.addImagesFromUrls, {
        assetId: asset.assetId,
        urls: images.map((image) => image.sourceUrl),
        ...(primaryIndex >= 0 ? { primaryIndex } : {}),
      })
      const failed = results.filter((result) => !result.ok)
      console.log(
        `  ${failed.length === 0 ? "✔" : "!"} ${asset.key}: ${results.length - failed.length}/${results.length} photos`
      )
      for (const result of failed) {
        if (!result.ok) console.log(`      ${result.url}: ${result.error}`)
      }
    } catch (error) {
      console.log(
        `  ! ${asset.key}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

/** Ask the web app to render previews for assets that have none. */
async function renderMissingPreviews(): Promise<void> {
  const missing = convexRun(internal.seedData.assetsWithoutPreviews, {})
  if (missing.length === 0) {
    console.log("• every asset has previews")
    return
  }
  if (!(await webIsUp())) {
    console.log(
      `• ${plural(missing.length, "asset")} without previews; the web app isn't running at ${WEB_URL}, so start \`pnpm dev\` and run \`pnpm seed --previews\` later.`
    )
    return
  }
  console.log(`Rendering previews for ${plural(missing.length, "asset")}…`)
  for (const { assetId, key } of missing) {
    try {
      const response = await fetch(
        `${WEB_URL}/api/assets/${assetId}/previews`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(180_000),
        }
      )
      console.log(
        response.ok
          ? `  ✔ ${key}`
          : `  ! ${key}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`
      )
    } catch (error) {
      console.log(
        `  ! ${key}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

async function runImport(path: string, url: string) {
  const file = readSeedFile(path)
  console.log(
    `Importing ${relative(repoRoot, path)}: ${plural(file.rooms.length, "room")}, ${plural(file.assets.length, "asset")}, ${plural(file.layouts.length, "layout")}`
  )

  const rooms = convexRun(internal.seedData.importRooms, { rooms: file.rooms })
  for (const room of rooms) {
    console.log(`  room '${room.name}': ${room.status}`)
    for (const change of room.changes) console.log(`      ${change}`)
  }

  const assets: ImportedAsset[] = []
  for (const batch of chunks(file.assets)) {
    assets.push(...convexRun(internal.seedData.importAssets, { assets: batch }))
  }
  console.log(`  assets: ${tally(assets.map((a) => a.status))}`)
  for (const asset of assets) {
    for (const warning of asset.warnings) {
      console.log(`      ${asset.key}: ${warning}`)
    }
  }

  const layouts = convexRun(internal.seedData.importLayouts, {
    layouts: file.layouts,
  })
  for (const layout of layouts) {
    console.log(`  layout '${layout.name}' (${layout.room}): ${layout.status}`)
  }

  await downloadPhotos(new ConvexHttpClient(url), file, assets)
  await renderMissingPreviews()
}

async function main() {
  const args = process.argv.slice(2)
  const { deployment, url } = await devDeployment()
  const importAt = args.indexOf("--import")

  if (importAt >= 0) {
    const pathArg = args[importAt + 1]
    const path =
      pathArg && !pathArg.startsWith("--")
        ? repoPath(pathArg)
        : DEFAULT_SEED_FILE
    console.log(`Seeding ${deployment} (${url}) from a file…`)
    await runImport(path, url)
    return
  }
  if (args.includes("--previews")) {
    await renderMissingPreviews()
    return
  }
  const refresh = args.includes("--refresh")
  console.log(
    `Seeding ${deployment} (${url})${refresh ? " with --refresh" : ""}…`
  )
  runSeed(refresh)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
