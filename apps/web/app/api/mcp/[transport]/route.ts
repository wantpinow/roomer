import { liveDeps } from "@/server/pipelines/live-deps"
import { localOnly } from "@/server/mcp/host-guard"
import { createRoomerMcpHandler } from "@/server/mcp/server"

// Roomer's MCP endpoint: Streamable HTTP at /api/mcp/mcp (the [transport]
// segment is always "mcp"; mcp-handler 2.x has no other transports). Local
// requests only — see server/mcp/host-guard.ts.

export const runtime = "nodejs"
// Photoreal renders wait on an image model for up to a few minutes.
export const maxDuration = 300

let handler: ((request: Request) => Promise<Response>) | undefined

const serve = localOnly(
  async (
    request: Request,
    { params }: { params: Promise<{ transport: string }> }
  ): Promise<Response> => {
    const { transport } = await params
    if (transport !== "mcp") {
      return Response.json(
        { error: "Roomer's MCP endpoint is /api/mcp/mcp" },
        { status: 404 }
      )
    }
    handler ??= createRoomerMcpHandler(liveDeps)
    return handler(request)
  }
)

export { serve as DELETE, serve as GET, serve as POST }
