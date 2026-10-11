import {
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  validateHostHeader,
  validateOriginHeader,
} from "@modelcontextprotocol/server"

// Roomer's MCP endpoint and pipeline routes are local-only. A browser tab on
// some other site could otherwise reach them through DNS rebinding (an
// attacker's hostname resolving to 127.0.0.1) or a cross-site request, so a
// request must name localhost / 127.0.0.1 / [::1] in its Host header, and
// any Origin it carries must be local too. Non-browser clients (Claude Code,
// the CLI) send no Origin and pass.

const ALLOWED_HOSTS = localhostAllowedHostnames()
const ALLOWED_ORIGINS = localhostAllowedOrigins()

/** A 403 for a non-local request, or null to let it through. */
export function rejectNonLocal(request: Request): Response | null {
  const host = validateHostHeader(request.headers.get("host"), ALLOWED_HOSTS)
  if (!host.ok) {
    return Response.json(
      {
        error: `Roomer only answers local requests (${host.message}).`,
      },
      { status: 403 }
    )
  }
  const origin = validateOriginHeader(
    request.headers.get("origin"),
    ALLOWED_ORIGINS
  )
  if (!origin.ok) {
    return Response.json(
      {
        error: `Roomer only answers local requests (${origin.message}).`,
      },
      { status: 403 }
    )
  }
  return null
}

/** Wraps a route handler so non-local requests get a 403. */
export function localOnly<Args extends unknown[]>(
  handler: (request: Request, ...rest: Args) => Promise<Response>
): (request: Request, ...rest: Args) => Promise<Response> {
  return async (request, ...rest) =>
    rejectNonLocal(request) ?? (await handler(request, ...rest))
}
