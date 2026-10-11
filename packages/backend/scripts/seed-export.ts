/**
 * `pnpm seed:export [path]`: writes the dev deployment's design data —
 * rooms, assets (photos as source URLs) and non-archived layouts — to
 * seed/roomer.json (or `path`, relative to the repo root), validated
 * against the seed schema and formatted deterministically so it diffs
 * cleanly when committed. `pnpm seed --import` reads it back.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, relative } from "node:path"

import { internal } from "../convex/_generated/api"
import { formatSeedFile, zSeedFile } from "../convex/seedFile"
import {
  convexRun,
  DEFAULT_SEED_FILE,
  devDeployment,
  repoPath,
  repoRoot,
} from "./dev-deployment"

async function main() {
  const [pathArg] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))
  const path = pathArg ? repoPath(pathArg) : DEFAULT_SEED_FILE
  const { deployment, url } = await devDeployment()
  console.log(`Exporting ${deployment} (${url})…`)

  const data = convexRun(internal.seedData.exportData, {})
  const checked = zSeedFile.safeParse(data)
  if (!checked.success) {
    throw new Error(
      `The exported data doesn't make a valid seed file:\n${checked.error.issues
        .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}`
    )
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, formatSeedFile(checked.data))

  const file = checked.data
  const photos = file.assets.reduce((n, a) => n + a.images.length, 0)
  const placements = file.layouts.reduce((n, l) => n + l.placements.length, 0)
  console.log(`✔ wrote ${relative(repoRoot, path)}`)
  console.log(
    `  ${file.rooms.length} room${file.rooms.length === 1 ? "" : "s"}, ${file.assets.length} assets (${photos} photo URLs), ${file.layouts.length} layouts (${placements} placements)`
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
