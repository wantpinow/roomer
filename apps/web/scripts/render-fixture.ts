/**
 * `pnpm --filter web render:fixture` — renders the furnished living-room
 * fixture through the running dev server's /render page and writes PNGs to
 * .roomer-out/render-fixture/: clay and id passes from two room cameras (kitchen door, window end), a
 * depth pass, the top and orbit views, and the sofa's four asset previews.
 * Checks each id pass pixel-exactly and that renders are deterministic.
 *
 * Needs `pnpm dev` (or `pnpm --filter web dev`) running; RENDER_BASE_URL
 * overrides http://localhost:3000.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { TEST_ASSETS } from "@roomer/core"

import {
  buildFixtureScene,
  FIXTURE_ASSETS,
  FIXTURE_CAMERAS,
  FIXTURE_PLACEMENTS,
} from "../lib/scene/fixture-scene"
import { idPassLegend } from "../lib/scene/id-pass"
import { ID_PASS_NON_ITEM_COLORS } from "../lib/scene/palette"
import type { RenderScene } from "../lib/scene/types"
import {
  closeRenderer,
  renderAssetPreviews,
  renderScene,
} from "../server/render/headless-renderer"
import { countPalettePixels } from "../server/render/id-pass"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))
const outDir = path.join(repoRoot, ".roomer-out", "render-fixture")

const fromDoor = { kind: "camera", camera: FIXTURE_CAMERAS.fromDoor } as const
const fromWindow = {
  kind: "camera",
  camera: FIXTURE_CAMERAS.fromWindow,
} as const

const RENDERS: [name: string, scene: RenderScene][] = [
  ["clay-from-door", buildFixtureScene({ view: fromDoor })],
  ["clay-from-window", buildFixtureScene({ view: fromWindow })],
  ["id-from-door", buildFixtureScene({ view: fromDoor, pass: "id" })],
  ["id-from-window", buildFixtureScene({ view: fromWindow, pass: "id" })],
  ["depth-from-door", buildFixtureScene({ view: fromDoor, pass: "depth" })],
  [
    "clay-top",
    buildFixtureScene({ view: { kind: "top" }, width: 1024, height: 1536 }),
  ],
  [
    "id-top",
    buildFixtureScene({
      view: { kind: "top" },
      pass: "id",
      width: 1024,
      height: 1536,
    }),
  ],
  ["clay-orbit", buildFixtureScene({ view: { kind: "orbit" } })],
]

function checkIdPass(name: string, png: Buffer): boolean {
  const legend = idPassLegend(FIXTURE_PLACEMENTS, FIXTURE_ASSETS)
  const counts = countPalettePixels(png, [
    ...legend.map((entry) => entry.hex),
    ...ID_PASS_NON_ITEM_COLORS,
  ])
  console.log(`  ${name}: ${counts.width}×${counts.height}`)
  for (const entry of legend) {
    const c = counts.colors[entry.hex]!
    console.log(
      `    ${entry.colorName.padEnd(8)} ${entry.placementId.padEnd(14)} ${String(c.pixels).padStart(8)} px  ${(c.share * 100).toFixed(2)}%`
    )
  }
  const shell = ID_PASS_NON_ITEM_COLORS.reduce(
    (sum, hex) => sum + counts.colors[hex]!.pixels,
    0
  )
  console.log(
    `    shell/background ${shell} px; unmatched ${counts.unmatched} px`
  )
  if (counts.unmatched > 0) {
    console.log(
      `    unexpected colours: ${JSON.stringify(counts.unmatchedColors)}`
    )
  }
  return counts.unmatched === 0
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const written: string[] = []
  let ok = true

  for (const [name, scene] of RENDERS) {
    const started = Date.now()
    const png = await renderScene(scene)
    const file = path.join(outDir, `${name}.png`)
    await writeFile(file, png)
    written.push(file)
    console.log(`${name}: ${Date.now() - started} ms`)
    if (scene.pass === "id") ok = checkIdPass(name, png) && ok
  }

  // Same input → same pixels.
  const [again, first] = await Promise.all([
    renderScene(RENDERS[0]![1]),
    renderScene(RENDERS[0]![1]),
  ])
  const deterministic = again.equals(first)
  console.log(`deterministic clay render: ${deterministic ? "yes" : "NO"}`)
  ok = deterministic && ok

  const started = Date.now()
  const previews = await renderAssetPreviews(TEST_ASSETS.sofa)
  for (const { view, png } of previews) {
    const file = path.join(outDir, `sofa-${view}.png`)
    await writeFile(file, png)
    written.push(file)
  }
  console.log(`sofa previews: ${Date.now() - started} ms`)

  console.log(`\nWrote ${written.length} PNGs:`)
  for (const file of written) console.log(`  ${file}`)
  if (!ok) {
    console.error("\nSome checks failed (see above).")
    process.exitCode = 1
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => closeRenderer())
