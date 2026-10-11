import { z } from "zod"

// Render passes and photoreal options shared by the renderer, the MCP tools
// and the backend's render records.

export const zRenderPass = z
  .enum(["clay", "id", "depth"])
  .describe(
    "clay = grey shaded model; id = flat colour per item (for mapping items to references); depth = distance"
  )

export const zRenderKind = z.enum(["clay", "id", "photoreal"])

export const zRenderStatus = z.enum(["pending", "done", "failed"])

export const PHOTOREAL_MODELS = [
  "openai/gpt-image-2.5-sunburst",
  "openai/gpt-image-2.5-flare",
  "google/gemini-3-pro-image",
  "google/gemini-3.1-flash-image",
  "bfl/flux-3-image",
  "stub",
] as const

export const zPhotorealModel = z
  .enum(PHOTOREAL_MODELS)
  .describe(
    "Image model. sunburst = precise edits (default); flare = faster; stub = free test double"
  )

export const DEFAULT_PHOTOREAL_MODEL = "openai/gpt-image-2.5-sunburst"

export const zRenderQuality = z
  .enum(["low", "medium", "high"])
  .describe("Use low for tests and quick looks")

export const zRenderSize = z.object({
  width: z.number().int().min(256).max(2048),
  height: z.number().int().min(256).max(2048),
})

export type RenderPass = z.infer<typeof zRenderPass>
export type RenderKind = z.infer<typeof zRenderKind>
export type RenderStatus = z.infer<typeof zRenderStatus>
export type PhotorealModel = z.infer<typeof zPhotorealModel>
export type RenderQuality = z.infer<typeof zRenderQuality>
export type RenderSize = z.infer<typeof zRenderSize>

/**
 * Fixed, named palette for the id pass: one flat colour per placed item, in
 * placement order. Names are used in the photoreal prompt ("the magenta item
 * is the sofa"), so they must be distinct, common colour words.
 */
export const ID_PASS_PALETTE = [
  { name: "red", hex: "#e6194b" },
  { name: "green", hex: "#3cb44b" },
  { name: "yellow", hex: "#ffe119" },
  { name: "blue", hex: "#4363d8" },
  { name: "orange", hex: "#f58231" },
  { name: "purple", hex: "#911eb4" },
  { name: "cyan", hex: "#42d4f4" },
  { name: "magenta", hex: "#f032e6" },
  { name: "lime", hex: "#bfef45" },
  { name: "pink", hex: "#fabed4" },
  { name: "teal", hex: "#469990" },
  { name: "lavender", hex: "#dcbeff" },
  { name: "brown", hex: "#9a6324" },
  { name: "beige", hex: "#fffac8" },
  { name: "maroon", hex: "#800000" },
  { name: "mint", hex: "#aaffc3" },
  { name: "olive", hex: "#808000" },
  { name: "apricot", hex: "#ffd8b1" },
  { name: "navy", hex: "#000075" },
  { name: "coral", hex: "#ff7f50" },
  { name: "indigo", hex: "#4b0082" },
  { name: "gold", hex: "#d4af37" },
  { name: "turquoise", hex: "#00ced1" },
  { name: "crimson", hex: "#dc143c" },
] as const

/** Flat colours for the room shell in the id pass (never used for items). */
export const ID_PASS_SHELL = {
  walls: "#d9d9d9",
  floor: "#8c8c8c",
  ceiling: "#f2f2f2",
  openings: "#ffffff",
  fixtures: "#595959",
} as const
