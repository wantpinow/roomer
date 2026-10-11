import type { PhotorealModel, RenderQuality } from "@roomer/core/schema"

// Starting a photoreal render from the UI: POST to the web app's route
// handler, which creates the pending render record and runs the pipeline in
// the background. The UI then just watches `renders.listByLayout`.

export interface PhotorealRequest {
  /** Id of one of the room's cameras. */
  camera: string
  model?: PhotorealModel
  quality?: RenderQuality
  size?: { width: number; height: number }
}

export type PhotorealResponse =
  | { ok: true; renderId: string }
  | { ok: false; message: string }

/** Pulls a readable message out of an error response body. */
export function errorFromBody(status: number, body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>
    for (const key of ["message", "error"] as const) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) return value
      if (typeof value === "object" && value !== null) {
        const nested = (value as Record<string, unknown>).message
        if (typeof nested === "string" && nested.trim()) return nested
      }
    }
  }
  if (status === 404) return "The render service isn't available yet."
  return `The render request failed (HTTP ${status}).`
}

export async function requestPhotoreal(
  layoutId: string,
  request: PhotorealRequest,
  fetcher: typeof fetch = fetch
): Promise<PhotorealResponse> {
  try {
    const response = await fetcher(
      `/api/layouts/${encodeURIComponent(layoutId)}/renders`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }
    )
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      return { ok: false, message: errorFromBody(response.status, body) }
    }
    const renderId =
      typeof body === "object" && body !== null && "renderId" in body
        ? String((body as { renderId: unknown }).renderId)
        : ""
    return { ok: true, renderId }
  } catch {
    return { ok: false, message: "Couldn't reach the app's server." }
  }
}
