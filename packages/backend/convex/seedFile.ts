/**
 * The design-data seed file (`seed/roomer.json`): rooms, assets and layouts
 * exported from a deployment so they can be committed and imported into
 * another (`pnpm seed:export`, `pnpm seed --import`).
 *
 * Everything is keyed by human names rather than Convex ids — rooms by name,
 * assets by key, layouts by (room, name), placements by asset key — so the
 * file means the same thing in any deployment. Shapes are built from the
 * core zod schemas; `formatSeedFile` validates and writes it with a stable
 * key order and layout so diffs stay readable.
 */
import {
  zAssetKey,
  zAssetSpec,
  zFinishes,
  zLabel,
  zLayoutStatus,
  zNote,
  zPlacement,
  zRoomSpec,
  zShellMeasurements,
} from "@roomer/core/schema"
import { z } from "zod"

import { MAX_ASSET_IMAGES, zAssetSource } from "./validators"

export const SEED_FILE_VERSION = 1

const room = zRoomSpec.shape

/** A room as its spec, with the measurements (corners are re-solved). */
export const zSeedRoom = z.object({
  name: room.name,
  ceilingHeight: room.ceilingHeight,
  measurements: zShellMeasurements,
  skirting: room.skirting,
  finishes: room.finishes,
  features: room.features,
  cameras: room.cameras,
})

/** A product photo by where it came from (blobs aren't exported). */
export const zSeedImage = z.object({
  sourceUrl: z.url(),
  primary: z.boolean(),
})

export const zSeedAsset = z.object({
  key: zAssetKey,
  source: zAssetSource,
  ...zAssetSpec.shape,
  images: z.array(zSeedImage).max(MAX_ASSET_IMAGES),
})

/** A placement referring to its asset by key. */
export const zSeedPlacement = z.object({
  id: zPlacement.shape.id,
  assetKey: zAssetKey,
  label: zPlacement.shape.label,
  x: zPlacement.shape.x,
  z: zPlacement.shape.z,
  facing: zPlacement.shape.facing,
  elevation: zPlacement.shape.elevation,
  mirrored: zPlacement.shape.mirrored,
})

export const zSeedLayout = z.object({
  room: zLabel.describe("The room's name"),
  name: zLabel,
  status: zLayoutStatus,
  notes: zNote.optional(),
  finishes: zFinishes.optional(),
  placements: z.array(zSeedPlacement).max(300),
})

function duplicates(values: readonly string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))]
}

export const zSeedFile = z
  .object({
    version: z.literal(SEED_FILE_VERSION),
    rooms: z.array(zSeedRoom),
    assets: z.array(zSeedAsset),
    layouts: z.array(zSeedLayout),
  })
  .superRefine((file, ctx) => {
    const roomNames = file.rooms.map((r) => r.name)
    for (const name of duplicates(roomNames)) {
      ctx.addIssue({
        code: "custom",
        path: ["rooms"],
        message: `Two rooms are called '${name}'; room names must be unique.`,
      })
    }
    const keys = new Set(file.assets.map((a) => a.key))
    for (const key of duplicates(file.assets.map((a) => a.key))) {
      ctx.addIssue({
        code: "custom",
        path: ["assets"],
        message: `Two assets have the key '${key}'; keys must be unique.`,
      })
    }
    for (const name of duplicates(
      file.layouts.map((l) => `'${l.name}' in '${l.room}'`)
    )) {
      ctx.addIssue({
        code: "custom",
        path: ["layouts"],
        message: `Two layouts are called ${name}; a room's layout names must be unique.`,
      })
    }
    file.layouts.forEach((layout, i) => {
      if (!roomNames.includes(layout.room)) {
        ctx.addIssue({
          code: "custom",
          path: ["layouts", i, "room"],
          message: `Layout '${layout.name}' is for room '${layout.room}', which isn't in the file.`,
        })
      }
      for (const id of duplicates(layout.placements.map((p) => p.id))) {
        ctx.addIssue({
          code: "custom",
          path: ["layouts", i, "placements"],
          message: `Layout '${layout.name}' has two placements with id '${id}'.`,
        })
      }
      layout.placements.forEach((placement, j) => {
        if (!keys.has(placement.assetKey)) {
          ctx.addIssue({
            code: "custom",
            path: ["layouts", i, "placements", j, "assetKey"],
            message: `Layout '${layout.name}' places '${placement.id}' as asset '${placement.assetKey}', which isn't in the file.`,
          })
        }
      })
    })
  })

export type SeedRoom = z.infer<typeof zSeedRoom>
export type SeedAsset = z.infer<typeof zSeedAsset>
export type SeedImage = z.infer<typeof zSeedImage>
export type SeedPlacement = z.infer<typeof zSeedPlacement>
export type SeedLayout = z.infer<typeof zSeedLayout>
export type SeedFile = z.infer<typeof zSeedFile>

/**
 * Arrays and objects of plain values that fit on one line stay on it
 * (`[0, 2650]`, `{ "w": 984, "d": 984, "h": 355 }`).
 */
const INLINE_WIDTH = 80

function isPlain(value: unknown): boolean {
  return value === null || typeof value !== "object"
}

function stringify(value: unknown, depth: number): string {
  const pad = "  ".repeat(depth + 1)
  const close = "  ".repeat(depth)
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    if (value.every(isPlain)) {
      const inline = `[${value.map((v) => JSON.stringify(v)).join(", ")}]`
      if (inline.length + pad.length <= INLINE_WIDTH) return inline
    }
    return `[\n${value.map((v) => pad + stringify(v, depth + 1)).join(",\n")}\n${close}]`
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return "{}"
    if (entries.every(([, v]) => isPlain(v))) {
      const inline = `{ ${entries
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(", ")} }`
      if (inline.length + pad.length <= INLINE_WIDTH) return inline
    }
    return `{\n${entries
      .map(([k, v]) => `${pad}${JSON.stringify(k)}: ${stringify(v, depth + 1)}`)
      .join(",\n")}\n${close}}`
  }
  return JSON.stringify(value)
}

/**
 * Validate a seed file and render it deterministically: keys in schema
 * order (zod's output order), two-space indents, short arrays inline, a
 * trailing newline. Throws a ZodError naming every problem.
 */
export function formatSeedFile(file: unknown): string {
  return `${stringify(zSeedFile.parse(file), 0)}\n`
}
