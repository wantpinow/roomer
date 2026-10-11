import { localOnly } from "@/server/mcp/host-guard"
import { liveDeps } from "@/server/pipelines/live-deps"
import { assetPreviewsRoute } from "@/server/pipelines/routes"

// POST { views? } → re-render the asset's clay previews and store them.

export const runtime = "nodejs"
export const maxDuration = 120

export const POST = localOnly(
  async (
    request: Request,
    { params }: { params: Promise<{ assetId: string }> }
  ): Promise<Response> => {
    const { assetId } = await params
    return assetPreviewsRoute(liveDeps(), assetId, request)
  }
)
