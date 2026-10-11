import { zPlacementId } from "@roomer/core/schema"
import { z } from "zod"

import { invalidInput } from "../../pipelines/errors"
import { renderPlan } from "../../pipelines/plan"
import {
  idPassVisibility,
  renderLayoutView,
  resolveView,
  sceneLegend,
  zOrbit,
  zViewCamera,
} from "../../pipelines/views"
import { DEFAULT_PLAN_MAX_SIDE } from "../../render/plan-png"
import { cameraLine, idLegend } from "../format"
import { loadLayout, loadRoom } from "../lookup"
import { toolResult } from "../result"
import { zLayoutId, zRoomId } from "../schemas"
import { defineTool, READ_ONLY, type RoomerTool } from "../tool"

export const DEFAULT_VIEW_SIZE = { width: 1280, height: 853 } as const

const zPixels = z.number().int().min(256).max(2048)

export const renderPlanTool = defineTool({
  name: "render_plan",
  title: "Render floor plan",
  description:
    "The floor plan as a PNG — fast and precise, the main way to check your work. With layoutId: room + furniture footprints + lint issues outlined; with roomId: just the room (walls, doors with swings, windows, radiators, sockets, fittings, dimensions). x points right, z down the page, C1 at the top-left (0, 0). highlight emphasises placement ids; svg: true also returns the SVG source.",
  inputSchema: z
    .object({
      layoutId: zLayoutId.optional(),
      roomId: zRoomId.optional(),
      highlight: z.array(zPlacementId).max(50).optional(),
      size: z
        .number()
        .int()
        .min(200)
        .max(4000)
        .optional()
        .describe(
          `Longest side of the PNG in px; default ${DEFAULT_PLAN_MAX_SIDE}`
        ),
      svg: z.boolean().optional().describe("Also return the SVG source"),
    })
    .refine(
      (args) => (args.layoutId === undefined) !== (args.roomId === undefined),
      {
        message:
          "Give exactly one of layoutId (room + furniture + lint) or roomId (just the room)",
      }
    ),
  annotations: READ_ONLY,
  async handler({ layoutId, roomId, highlight, size, svg }, { api }) {
    const layout = layoutId ? await loadLayout(api, layoutId) : undefined
    const targetRoomId = layout?.roomId ?? roomId
    if (!targetRoomId) throw invalidInput("Give layoutId or roomId.")
    const room = await loadRoom(api, targetRoomId)
    const plan = await renderPlan({
      room,
      ...(layout ? { layout } : {}),
      ...(highlight ? { highlight } : {}),
      maxSide: size ?? DEFAULT_PLAN_MAX_SIDE,
    })
    const subject = layout
      ? `layout "${layout.name}" (revision ${layout.revision}, ${layout.placements.length} items) in room "${room.name}"`
      : `room "${room.name}"`
    const lines = [
      `Floor plan of ${subject}: x right, z down the page, C1 at (0, 0); lengths in mm.`,
    ]
    if (svg) lines.push("", "SVG:", plan.svg)
    return toolResult({
      text: lines.join("\n"),
      structured: {
        ...(layout ? { layoutId: layout._id } : {}),
        roomId: room._id,
        ...(svg ? { svg: plan.svg } : {}),
      },
      images: [plan.png],
    })
  },
})

export const renderView = defineTool({
  name: "render_view",
  title: "Render 3D view",
  description:
    'Render a layout in 3D from a camera and return the PNG(s). camera: a saved camera id (list_cameras), "top" (orthographic plan view, walls cut at 1.2m), "orbit" (3/4 dollhouse view from outside; set orbit.azimuth/elevation) or an inline { position, target, fov, projection? } in room mm. pass: "clay" (grey shaded model, default), "id" (one flat colour per item, with the colour legend and each item\'s share of the frame — shows what the camera actually sees) or "both". Default 1280×853 px.',
  inputSchema: z.object({
    layoutId: zLayoutId,
    camera: zViewCamera,
    orbit: zOrbit.optional(),
    pass: z.enum(["clay", "id", "both"]).optional().describe("Default clay"),
    width: zPixels
      .optional()
      .describe(`px, default ${DEFAULT_VIEW_SIZE.width}`),
    height: zPixels
      .optional()
      .describe(`px, default ${DEFAULT_VIEW_SIZE.height}`),
  }),
  annotations: READ_ONLY,
  async handler(args, deps) {
    const layout = await loadLayout(deps.api, args.layoutId)
    const room = await loadRoom(deps.api, layout.roomId)
    const resolved = resolveView(room.cameras, args.camera, args.orbit)
    const width = args.width ?? DEFAULT_VIEW_SIZE.width
    const height = args.height ?? DEFAULT_VIEW_SIZE.height
    const pass = args.pass ?? "clay"
    const passes =
      pass === "both" ? (["clay", "id"] as const) : ([pass] as const)
    const rendered = await renderLayoutView(
      deps,
      { room, layout, view: resolved.view, width, height },
      passes
    )
    const lines = [
      `${passes.join(" + ").replace(/^c/, "C")} render of "${layout.name}" (revision ${layout.revision}) from the ${resolved.label}, ${width}×${height}px. Images in order: ${passes.join(", ")}.`,
    ]
    if (resolved.camera) lines.push(cameraLine(resolved.camera).slice(2))
    const id = rendered.find((r) => r.pass === "id")
    let shares: Record<string, number> | undefined
    if (id) {
      const legend = sceneLegend(layout)
      shares = idPassVisibility(id.png, legend).shares
      lines.push(idLegend(legend, shares))
    }
    return toolResult({
      text: lines.join("\n"),
      structured: {
        layoutId: layout._id,
        revision: layout.revision,
        passes,
        width,
        height,
        ...(resolved.camera ? { camera: resolved.camera } : {}),
        ...(shares ? { visibleShare: shares } : {}),
      },
      images: rendered.map((r) => r.png),
    })
  },
})

export const viewTools: RoomerTool[] = [renderPlanTool, renderView]
