import {
  zAssetSpec,
  zCamera,
  zFinishes,
  zPlacement,
  zRenderPass,
  zRoomSpec,
  zVec2,
} from "@roomer/core"
import { z } from "zod"

// Everything the scene needs to draw a room or an asset, as plain data. The
// /render page receives these over `page.evaluate`, so they must stay JSON
// (no class instances, no functions) and fully describe the picture:
// identical input → identical pixels. The schemas validate what arrives at
// the page; the types are derived from them.

/** The room as the scene sees it: solved geometry plus optional finishes. */
export const zSceneRoom = zRoomSpec
  .pick({ ceilingHeight: true, skirting: true, features: true })
  .extend({
    corners: z.array(zVec2).min(3),
    finishes: zFinishes.optional(),
  })

/**
 * Where the picture is taken from.
 * - `camera`: a saved room camera (perspective, eye height, ceiling shown).
 * - `top`: orthographic plan view from above, fitted to the room.
 * - `orbit`: perspective 3/4 "dollhouse" view from outside; walls between
 *   the camera and the room are cut down so you can see in. `azimuth` is the
 *   plan bearing from the room's centre to the camera (default 225 = from
 *   the bottom-left of the plan); `elevation` is degrees above the horizon
 *   (default 45).
 */
export const zCameraView = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("camera"), camera: zCamera }),
  z.object({ kind: z.literal("top") }),
  z.object({
    kind: z.literal("orbit"),
    azimuth: z.number().finite().optional(),
    elevation: z.number().min(5).max(89).optional(),
  }),
])

/** Output size in pixels. */
export const zPixels = z.number().int().min(16).max(4096)

/** A room render request: one pass, one view, exact pixel size. */
export const zRenderScene = z
  .object({
    room: zSceneRoom,
    placements: z.array(zPlacement),
    /** Assets keyed by `placement.assetId`. */
    assets: z.record(z.string(), zAssetSpec),
    view: zCameraView,
    pass: zRenderPass,
    width: zPixels,
    height: zPixels,
    /** Default: true for camera views, false for top and orbit. */
    showCeiling: z.boolean().optional(),
  })
  .superRefine((scene, ctx) => {
    scene.placements.forEach((placement, index) => {
      if (!(placement.assetId in scene.assets)) {
        ctx.addIssue({
          code: "custom",
          path: ["placements", index, "assetId"],
          message: `Placement "${placement.id}" uses asset "${placement.assetId}", which is not in \`assets\``,
        })
      }
    })
  })

export const ASSET_PREVIEW_VIEWS = ["front", "side", "top", "iso"] as const

export const zAssetPreviewView = z.enum(ASSET_PREVIEW_VIEWS)

/** An asset preview render request (always the clay look). */
export const zRenderAssetScene = z.object({
  asset: zAssetSpec,
  view: zAssetPreviewView,
  width: zPixels,
  height: zPixels,
  pass: z.literal("clay").optional(),
})

export type SceneRoom = z.infer<typeof zSceneRoom>
export type CameraView = z.infer<typeof zCameraView>
export type CameraViewKind = CameraView["kind"]
export type RenderScene = z.infer<typeof zRenderScene>
export type AssetPreviewView = z.infer<typeof zAssetPreviewView>
export type RenderAssetScene = z.infer<typeof zRenderAssetScene>

/** What a scene draws, without the pixel size (the canvas decides that). */
export type SceneContent = Omit<RenderScene, "width" | "height">

/** What the /render page exposes on `window.roomer` for the headless renderer. */
export interface RoomerRenderApi {
  ready: true
  /** PNG data URL at exactly `width × height`. */
  render(scene: RenderScene): Promise<string>
  renderAsset(scene: RenderAssetScene): Promise<string>
}

declare global {
  interface Window {
    /** Set by the /render page once it can take requests. */
    roomer?: RoomerRenderApi
  }
}

/** Scene units are metres (architecture §3.1); the domain is millimetres. */
export function toMetres(mm: number): number {
  return mm / 1000
}

export function showsCeiling(
  scene: Pick<RenderScene, "view" | "showCeiling">
): boolean {
  return scene.showCeiling ?? scene.view.kind === "camera"
}
