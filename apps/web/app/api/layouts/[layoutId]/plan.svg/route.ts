import { localOnly } from "@/server/mcp/host-guard"
import { liveDeps } from "@/server/pipelines/live-deps"
import { planSvgRoute } from "@/server/pipelines/routes"

// GET → the layout's floor plan as SVG in the app's palette
// (?highlight=sofa,rug emphasises placements; ?theme=dark for dark mode).

export const runtime = "nodejs"

export const GET = localOnly(
  async (
    request: Request,
    { params }: { params: Promise<{ layoutId: string }> }
  ): Promise<Response> => {
    const { layoutId } = await params
    return planSvgRoute(liveDeps(), layoutId, new URL(request.url))
  }
)
