import {
  zFinishes,
  zLabel,
  zLayoutOp,
  zLayoutStatus,
  zNote,
} from "@roomer/core/schema"
import { z } from "zod"

import type { LayoutDetail, RoomDetail } from "../../convex"
import { renderPlan } from "../../pipelines/plan"
import {
  changeList,
  layoutDetail,
  layoutList,
  lintReport,
  placementLine,
} from "../format"
import {
  LAYOUT_OPS_REFERENCE,
  zListedFinishes,
  zListedLayoutOp,
} from "../listing"
import { loadLayout, loadRoom } from "../lookup"
import { toolResult } from "../result"
import { zIncludePlan, zLayoutId, zRoomId } from "../schemas"
import { defineTool, READ_ONLY, WRITES, type RoomerTool } from "../tool"

const MAX_LAYOUT_OPS = 100

const zExpectedRevision = z
  .number()
  .int()
  .nonnegative()
  .optional()
  .describe(
    "Fail with CONFLICT unless the layout is still at this revision (someone else may have edited it)"
  )

async function layoutPlan(
  room: RoomDetail,
  layout: LayoutDetail,
  include: boolean,
  highlight: readonly string[] = []
): Promise<Buffer[]> {
  if (!include) return []
  return [(await renderPlan({ room, layout, highlight })).png]
}

const PLAN_NOTE =
  "The plan PNG follows: x right, z down the page; lint issues are outlined."

export const listLayouts = defineTool({
  name: "list_layouts",
  title: "List layouts",
  description:
    "A room's layouts: id, name, status, revision, item count, total price and lint counts.",
  inputSchema: z.object({ roomId: zRoomId }),
  annotations: READ_ONLY,
  async handler({ roomId }, { api }) {
    const layouts = await api.layouts.listByRoom({ roomId })
    return toolResult({ text: layoutList(layouts), structured: { layouts } })
  },
})

export const getLayout = defineTool({
  name: "get_layout",
  title: "Get layout",
  description:
    "A layout's items (placement id, asset name and key, W\u00d7D\u00d7H, centre (x, z), facing, elevation, where it sits relative to the walls), notes, finishes override, total price and lint (errors first, with hints). includePlan adds the plan PNG.",
  inputSchema: z.object({ layoutId: zLayoutId, includePlan: zIncludePlan }),
  annotations: READ_ONLY,
  async handler({ layoutId, includePlan = false }, { api }) {
    const layout = await loadLayout(api, layoutId)
    const room = await loadRoom(api, layout.roomId)
    const text = layoutDetail(layout, room.name)
    return toolResult({
      text: includePlan ? `${text}\n\n${PLAN_NOTE}` : text,
      structured: { layout },
      images: await layoutPlan(room, layout, includePlan),
    })
  },
})

export const createLayout = defineTool({
  name: "create_layout",
  title: "Create layout",
  description:
    "Create an empty layout in a room, or a copy of an existing one (fromLayoutId) to try a variation without touching the original. Then add furniture with apply_changes.",
  inputSchema: z.object({
    roomId: zRoomId,
    name: zLabel.describe("e.g. 'Sofa facing the window'"),
    fromLayoutId: zLayoutId.optional().describe("Copy this layout's items"),
    notes: zNote.optional().describe("The idea behind this layout"),
  }),
  annotations: WRITES,
  async handler({ roomId, name, fromLayoutId, notes }, { api }) {
    const { layoutId, lint } = await api.layouts.create({
      roomId,
      name,
      ...(fromLayoutId ? { fromLayoutId } : {}),
      ...(notes !== undefined ? { notes } : {}),
      actor: "agent",
    })
    const layout = await loadLayout(api, layoutId)
    const source = fromLayoutId
      ? ` as a copy of ${fromLayoutId} (${layout.placements.length} items)`
      : ""
    return toolResult({
      text: [
        `Created layout "${name}" — id ${layoutId}${source}.`,
        lintReport(lint),
        "Add items with apply_changes.",
      ].join("\n"),
      structured: { layoutId, lint },
    })
  },
})

const zUpdateLayoutArgs = z.object({
  layoutId: zLayoutId,
  name: zLabel.optional(),
  notes: zNote.optional().describe("Replaces the notes; empty string clears"),
  status: zLayoutStatus.optional(),
  finishes: zFinishes
    .nullable()
    .optional()
    .describe("Overrides the room's finishes for this layout; null removes it"),
  expectedRevision: zExpectedRevision,
})

export const updateLayout = defineTool({
  name: "update_layout",
  title: "Update layout",
  description:
    "Set a layout's name, notes (your rationale; justify any warnings you accept), status (draft \u2192 candidate \u2192 favourite; archived hides it) or finishes override (null removes it).",
  inputSchema: zUpdateLayoutArgs,
  listedSchema: zUpdateLayoutArgs.extend({
    finishes: zListedFinishes
      .nullable()
      .optional()
      .describe(
        "Overrides the room's finishes for this layout (walls, floor, ceiling, skirting, notes as short phrases); null removes it"
      ),
  }),
  annotations: WRITES,
  async handler({ layoutId, ...fields }, { api }) {
    const { revision } = await api.layouts.update({
      layoutId,
      ...fields,
      actor: "agent",
    })
    const changed = Object.keys(fields).filter((k) => k !== "expectedRevision")
    return toolResult({
      text: `Updated ${changed.join(", ") || "nothing"} — layout ${layoutId} is at revision ${revision}.`,
      structured: { layoutId, revision },
    })
  },
})

export const applyChanges = defineTool({
  name: "apply_changes",
  title: "Apply layout changes",
  description: [
    "Atomic, ordered batch of furniture edits; if any op fails nothing is applied and the error names the op and field. Positions place the footprint centre: against = back (or side) to a wall, clear of the skirting, facing into the room; onWall = TV, art, shelf; centerOn = rug under a table, pendant at L1; inCorner; at = absolute. swap keeps the centre and facing. Returns the changes, where touched items ended up and lint (errors first, with hints) \u2014 fix every error. includePlan adds the plan with them highlighted.",
    LAYOUT_OPS_REFERENCE,
  ].join("\n\n"),
  inputSchema: z.object({
    layoutId: zLayoutId,
    ops: z.array(zLayoutOp).min(1).max(MAX_LAYOUT_OPS),
    expectedRevision: zExpectedRevision,
    includePlan: zIncludePlan,
  }),
  listedSchema: z.object({
    layoutId: zLayoutId,
    ops: z.array(zListedLayoutOp).min(1).max(MAX_LAYOUT_OPS),
    expectedRevision: zExpectedRevision,
    includePlan: zIncludePlan,
  }),
  annotations: WRITES,
  async handler(
    { layoutId, ops, expectedRevision, includePlan = false },
    { api }
  ) {
    const result = await api.layouts.applyChanges({
      layoutId,
      ops,
      actor: "agent",
      ...(expectedRevision !== undefined ? { expectedRevision } : {}),
    })
    const layout = await loadLayout(api, layoutId)
    const touched = [
      ...new Set(
        result.changes.filter((c) => c.op !== "remove").map((c) => c.id)
      ),
    ]
    const placed = layout.placements.filter((p) => touched.includes(p.id))
    const room = includePlan ? await loadRoom(api, layout.roomId) : undefined
    const text = [
      changeList(result.changes, result.revision),
      ...(placed.length > 0
        ? ["Now:", ...placed.map((p) => placementLine(p, layout))]
        : []),
      `Layout has ${layout.placements.length} item${layout.placements.length === 1 ? "" : "s"}.`,
      lintReport(result.lint),
      ...(includePlan ? ["", PLAN_NOTE] : []),
    ].join("\n")
    return toolResult({
      text,
      structured: {
        revision: result.revision,
        changes: result.changes,
        lint: result.lint,
        placements: result.placements,
      },
      images: room ? await layoutPlan(room, layout, true, touched) : [],
    })
  },
})

export const lintLayout = defineTool({
  name: "lint_layout",
  title: "Lint layout",
  description:
    "A layout's current lint: errors (E\u2026, must fix), warnings (W\u2026, fix or justify in the notes) and info (I\u2026), each naming the items and features involved, with mm and a hint.",
  inputSchema: z.object({ layoutId: zLayoutId }),
  annotations: READ_ONLY,
  async handler({ layoutId }, { api }) {
    const layout = await loadLayout(api, layoutId)
    return toolResult({
      text: `Layout "${layout.name}" at revision ${layout.revision}.\n${lintReport(layout.lint, { maxInfo: 50 })}`,
      structured: { lint: layout.lint, revision: layout.revision },
    })
  },
})

export const layoutTools: RoomerTool[] = [
  listLayouts,
  getLayout,
  createLayout,
  updateLayout,
  applyChanges,
  lintLayout,
]
