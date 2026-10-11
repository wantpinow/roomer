import { after } from "next/server"

import { localOnly } from "@/server/mcp/host-guard"
import { liveDeps } from "@/server/pipelines/live-deps"
import { startRenderRoute } from "@/server/pipelines/routes"

// POST { camera, model?, quality?, size?, extraPrompt? } → 202 { renderId }.
// The photoreal pipeline keeps running after the response; the UI watches
// the render record through Convex.

export const runtime = "nodejs"
export const maxDuration = 300

export const POST = localOnly(
  async (
    request: Request,
    { params }: { params: Promise<{ layoutId: string }> }
  ): Promise<Response> => {
    const { layoutId } = await params
    return startRenderRoute(liveDeps(), layoutId, request, (task) =>
      after(task)
    )
  }
)
