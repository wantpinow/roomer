import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { Resvg } from "@resvg/resvg-js"

import { lint } from "../src/lint"
import { planSvg, type PlanSvgInput } from "../src/plan"
import {
  ASSETS,
  placeAll,
  REALISTIC_LAYOUT,
  REALISTIC_OPS,
  ROOM,
} from "../tests/lint/layouts"

// Renders the living room's floor plan — empty, furnished, and furnished
// with a deliberate overlap and the lint overlay — to SVG and PNG so the
// drawing can be checked by eye. Run with `pnpm --filter @roomer/core
// plan:preview`; files land in <repo>/.roomer-out/plan/.

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, "../../../.roomer-out/plan")
mkdirSync(outDir, { recursive: true })

function write(name: string, input: PlanSvgInput): void {
  const svg = planSvg(input)
  writeFileSync(resolve(outDir, `${name}.svg`), svg)
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 1600 },
    font: { loadSystemFonts: true, defaultFontFamily: "Helvetica" },
  })
    .render()
    .asPng()
  writeFileSync(resolve(outDir, `${name}.png`), png)
  console.log(resolve(outDir, `${name}.png`))
}

write("living-room-empty", {
  room: ROOM,
  options: { title: "Living room" },
})

write("living-room-layout", {
  room: ROOM,
  placements: REALISTIC_LAYOUT,
  assets: ASSETS,
  lint: lint({ room: ROOM, placements: REALISTIC_LAYOUT, assets: ASSETS }),
  options: { title: "Living room — kitchen-end dining" },
})

const clashing = placeAll([
  ...REALISTIC_OPS,
  { op: "nudge", id: "coffee-table", dx: -480 },
  { op: "nudge", id: "chair-4", dx: 520 },
])
write("living-room-lint", {
  room: ROOM,
  placements: clashing,
  assets: ASSETS,
  lint: lint({ room: ROOM, placements: clashing, assets: ASSETS }),
  options: { title: "Living room — with issues", highlight: ["sofa"] },
})
