import {
  DEFAULT_CAMERA_FOV,
  zAssetSpec,
  zCamera,
  type AssetSpec,
  type Camera,
  type Finishes,
  type RenderPass,
} from "@roomer/core/schema"
import { z } from "zod"

import { idPassLegend, type IdPassLegendEntry } from "@/lib/scene/id-pass"
import type { CameraView, RenderScene, SceneRoom } from "@/lib/scene/types"

import type { LayoutDetail, RoomDetail } from "../convex"
import { countPalettePixels } from "../render/id-pass"

import type { PipelineDeps } from "./deps"
import { notFound } from "./errors"

// Rendering a layout from a viewpoint: resolve what the caller asked for (a
// saved camera id, an inline camera, "top" or "orbit") into a scene view,
// build the plain-data scene the /render page draws, and read the id pass
// back into per-item visibility. Pure apart from `renderLayoutView`.

/** A camera given inline: where the eye is and what it looks at. */
export const zInlineCamera = zCamera
  .pick({ position: true, target: true, projection: true })
  .extend({
    fov: zCamera.shape.fov
      .optional()
      .describe(
        `Vertical field of view in degrees; default ${DEFAULT_CAMERA_FOV}`
      ),
    name: zCamera.shape.name
      .optional()
      .describe(
        'What to call this viewpoint on the render record, e.g. "Walk photo 14:05"; default "Inline camera"'
      ),
  })
  .describe(
    "An ad-hoc camera: position and target [x, y, z] in room mm (y = height, eye ≈ 1,500), vertical fov in degrees, optional projection"
  )

export const zViewCamera = z
  .union([
    z
      .string()
      .trim()
      .min(1)
      .describe(
        'A saved camera id (see list_cameras), "top" (plan view from above, walls cut at 1.2m) or "orbit" (3/4 dollhouse view from outside)'
      ),
    zInlineCamera,
  ])
  .describe("Where to look from")

export const zOrbit = z
  .object({
    azimuth: z
      .number()
      .finite()
      .optional()
      .describe(
        "Plan bearing from the room's centre to the camera; default 225 (from the bottom-left of the plan)"
      ),
    elevation: z
      .number()
      .min(5)
      .max(89)
      .optional()
      .describe("Degrees above the horizon; default 45"),
  })
  .describe('Only for camera "orbit"')

export type InlineCamera = z.infer<typeof zInlineCamera>
export type ViewCamera = z.infer<typeof zViewCamera>
export type Orbit = z.infer<typeof zOrbit>

export interface ResolvedView {
  view: CameraView
  /** The perspective camera, for saved and inline cameras. */
  camera?: Camera
  /** Short description for text output, e.g. `camera from-d1`. */
  label: string
}

export const INLINE_CAMERA_ID = "inline"

export function inlineCamera(input: InlineCamera): Camera {
  return {
    id: INLINE_CAMERA_ID,
    name: input.name ?? "Inline camera",
    position: input.position,
    target: input.target,
    fov: input.fov ?? DEFAULT_CAMERA_FOV,
    ...(input.projection ? { projection: input.projection } : {}),
  }
}

export function resolveView(
  cameras: readonly Camera[],
  requested: ViewCamera,
  orbit: Orbit = {}
): ResolvedView {
  if (typeof requested !== "string") {
    const camera = inlineCamera(requested)
    return { view: { kind: "camera", camera }, camera, label: "inline camera" }
  }
  if (requested === "top") return { view: { kind: "top" }, label: "top view" }
  if (requested === "orbit") {
    return {
      view: {
        kind: "orbit",
        ...(orbit.azimuth !== undefined ? { azimuth: orbit.azimuth } : {}),
        ...(orbit.elevation !== undefined
          ? { elevation: orbit.elevation }
          : {}),
      },
      label: "orbit view",
    }
  }
  const camera = cameras.find((c) => c.id === requested)
  if (!camera) {
    const ids = cameras.map((c) => c.id)
    throw notFound(
      `The room has no camera '${requested}'. Saved cameras: ${ids.length > 0 ? ids.join(", ") : "none"}; or use "top", "orbit", or an inline { position, target, fov, projection? }.`
    )
  }
  return {
    view: { kind: "camera", camera },
    camera,
    label: `camera ${camera.id}`,
  }
}

/** Layout finishes override the room's, field by field. */
export function mergedFinishes(
  room: Finishes,
  layout: Finishes | undefined
): Finishes {
  return { ...room, ...layout }
}

export function sceneRoom(
  room: Pick<
    RoomDetail,
    "shell" | "ceilingHeight" | "skirting" | "features" | "finishes"
  >,
  layoutFinishes?: Finishes
): SceneRoom {
  return {
    corners: room.shell.corners,
    ceilingHeight: room.ceilingHeight,
    skirting: room.skirting,
    features: room.features,
    finishes: mergedFinishes(room.finishes, layoutFinishes),
  }
}

/** The layout's assets as plain specs, keyed by asset id. */
export function sceneAssets(
  layout: Pick<LayoutDetail, "assets">
): Record<string, AssetSpec> {
  return Object.fromEntries(
    Object.entries(layout.assets).map(([id, entry]) => [
      id,
      zAssetSpec.parse(entry),
    ])
  )
}

export interface SceneInput {
  room: Pick<
    RoomDetail,
    "shell" | "ceilingHeight" | "skirting" | "features" | "finishes"
  >
  /** Omit for an empty room. */
  layout?: Pick<LayoutDetail, "placements" | "assets" | "finishes">
  view: CameraView
  width: number
  height: number
}

export function buildRenderScene(
  input: SceneInput,
  pass: RenderPass
): RenderScene {
  return {
    room: sceneRoom(input.room, input.layout?.finishes),
    placements: input.layout?.placements ?? [],
    assets: input.layout ? sceneAssets(input.layout) : {},
    view: input.view,
    pass,
    width: input.width,
    height: input.height,
  }
}

export function sceneLegend(
  layout: Pick<LayoutDetail, "placements" | "assets"> | undefined
): IdPassLegendEntry[] {
  return layout ? idPassLegend(layout.placements, sceneAssets(layout)) : []
}

export interface IdPassVisibility {
  totalPixels: number
  /** Visible pixels per placement id. */
  byPlacement: Record<string, number>
  /** Share of the frame per placement id, 0..1. */
  shares: Record<string, number>
}

/**
 * Per-placement visibility from an id pass. Past the palette's length
 * colours repeat; placements sharing a colour split its pixels evenly.
 */
export function idPassVisibility(
  idPng: Buffer,
  legend: readonly IdPassLegendEntry[]
): IdPassVisibility {
  const hexes = [...new Set(legend.map((entry) => entry.hex.toLowerCase()))]
  const counts = countPalettePixels(idPng, hexes)
  const sharing = new Map<string, number>()
  for (const entry of legend) {
    const hex = entry.hex.toLowerCase()
    sharing.set(hex, (sharing.get(hex) ?? 0) + 1)
  }
  const byPlacement: Record<string, number> = {}
  const shares: Record<string, number> = {}
  for (const entry of legend) {
    const hex = entry.hex.toLowerCase()
    const pixels = Math.round(
      (counts.colors[hex]?.pixels ?? 0) / (sharing.get(hex) ?? 1)
    )
    byPlacement[entry.placementId] = pixels
    shares[entry.placementId] = counts.total > 0 ? pixels / counts.total : 0
  }
  return { totalPixels: counts.total, byPlacement, shares }
}

export interface RenderedPass {
  pass: RenderPass
  png: Buffer
}

/** Render each requested pass of a scene, in order. */
export async function renderLayoutView(
  deps: Pick<PipelineDeps, "renderer">,
  input: SceneInput,
  passes: readonly RenderPass[]
): Promise<RenderedPass[]> {
  const out: RenderedPass[] = []
  for (const pass of passes) {
    const png = await deps.renderer.renderScene(buildRenderScene(input, pass))
    out.push({ pass, png })
  }
  return out
}
