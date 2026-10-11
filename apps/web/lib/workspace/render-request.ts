import type { Camera, PhotorealModel, RenderQuality } from "@roomer/core/schema"

// UI actions that run server-side pipelines: POST to the web app's route
// handlers, which create the pending records and work in the background.
// The UI then just watches the Convex queries (`renders.listByLayout`,
// `assets.get`) fill in.

export interface PhotorealRequest {
  /**
   * Id of one of the room's cameras, or an inline viewpoint (e.g. a photo
   * taken in walk mode) with an optional name for the render record.
   */
  camera:
    | string
    | (Pick<Camera, "position" | "target" | "fov" | "projection"> & {
        name?: string
      })
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

type PostResult = { ok: true; body: unknown } | { ok: false; message: string }

/** POST JSON to one of the app's route handlers; failures become sentences. */
export async function postJson(
  url: string,
  payload: unknown,
  fetcher: typeof fetch = fetch
): Promise<PostResult> {
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      return { ok: false, message: errorFromBody(response.status, body) }
    }
    return { ok: true, body }
  } catch {
    return { ok: false, message: "Couldn't reach the app's server." }
  }
}

export async function requestPhotoreal(
  layoutId: string,
  request: PhotorealRequest,
  fetcher: typeof fetch = fetch
): Promise<PhotorealResponse> {
  const result = await postJson(
    `/api/layouts/${encodeURIComponent(layoutId)}/renders`,
    request,
    fetcher
  )
  if (!result.ok) return result
  const body = result.body
  const renderId =
    typeof body === "object" && body !== null && "renderId" in body
      ? String(body.renderId)
      : ""
  return { ok: true, renderId }
}

/** Re-render an asset's four preview images (front, side, top, iso). */
export async function requestAssetPreviews(
  assetId: string,
  fetcher: typeof fetch = fetch
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await postJson(
    `/api/assets/${encodeURIComponent(assetId)}/previews`,
    {},
    fetcher
  )
  return result.ok ? { ok: true } : result
}
