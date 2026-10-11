import { z } from "zod"

import { overview } from "../format"
import { toolResult } from "../result"
import { defineTool, READ_ONLY, type RoomerTool } from "../tool"

export const getOverview = defineTool({
  name: "get_overview",
  title: "Overview (start here)",
  description:
    "Start here: every room (id, size) with its layouts (id, status, revision, items, price, lint counts) and an asset-library summary.",
  inputSchema: z.object({}),
  annotations: READ_ONLY,
  async handler(_args, { api }) {
    const [rooms, assets] = await Promise.all([
      api.rooms.list({}),
      api.assets.list({}),
    ])
    const withLayouts = await Promise.all(
      rooms.map(async (room) => ({
        room,
        layouts: await api.layouts.listByRoom({ roomId: room._id }),
      }))
    )
    return toolResult({
      text: overview(withLayouts, assets),
      structured: {
        rooms: withLayouts.map(({ room, layouts }) => ({
          ...room,
          layouts,
        })),
        assets: {
          total: assets.length,
          library: assets.filter((a) => a.source === "library").length,
          custom: assets.filter((a) => a.source === "custom").length,
        },
      },
    })
  },
})

export const overviewTools: RoomerTool[] = [getOverview]
