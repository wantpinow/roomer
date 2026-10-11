// Moving image bytes in and out of the web server: downloading product and
// room photos (and stored files, for photoreal references) and uploading
// renders to Convex file storage. Fetch is injected so tests never touch the
// network.

/** Browser-like UA: many retailers refuse obvious bots. */
export const DOWNLOAD_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
export const DOWNLOAD_TIMEOUT_MS = 20_000
export const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024

export interface DownloadedImage {
  data: Buffer
  /** Media type from the response, e.g. "image/jpeg". */
  mime: string
}

/** A download the agent can fix (bad URL, blocked, not an image, …). */
export class DownloadError extends Error {
  override readonly name = "DownloadError"
  readonly url: string

  constructor(url: string, message: string) {
    super(`Couldn't download ${url}: ${message}`)
    this.url = url
  }
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`

/**
 * GET an image: http(s) only, browser-like headers, a timeout, an image/*
 * content type and a size cap. Throws `DownloadError` with a sentence that
 * says what to do.
 */
export async function downloadImage(
  url: string,
  fetchImpl: typeof fetch = fetch,
  { timeoutMs = DOWNLOAD_TIMEOUT_MS, maxBytes = MAX_DOWNLOAD_BYTES } = {}
): Promise<DownloadedImage> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new DownloadError(url, "not a valid URL.")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new DownloadError(url, "only http(s) URLs can be downloaded.")
  }
  let response: Response
  try {
    response = await fetchImpl(parsed.href, {
      headers: {
        "User-Agent": DOWNLOAD_USER_AGENT,
        // Formats the image models accept (no AVIF: CDNs with automatic
        // formats would send it, and gpt-image rejects it).
        Accept: "image/webp,image/png,image/jpeg;q=0.9,image/*;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError"
    throw new DownloadError(
      url,
      timedOut
        ? `timed out after ${Math.round(timeoutMs / 1000)}s.`
        : `${error instanceof Error ? error.message : String(error)}.`
    )
  }
  if (!response.ok) {
    throw new DownloadError(
      url,
      `the server answered HTTP ${response.status}. If the site blocks downloads, use a different image URL (e.g. the CDN link of the photo itself).`
    )
  }
  const mime = (response.headers.get("content-type") ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase()
  if (!mime.startsWith("image/")) {
    throw new DownloadError(
      url,
      `not an image (content type '${mime || "unknown"}'). Use the direct image URL, not the product page.`
    )
  }
  const declared = Number(response.headers.get("content-length") ?? 0)
  if (declared > maxBytes) {
    throw new DownloadError(
      url,
      `the image is ${megabytes(declared)}; the limit is ${megabytes(maxBytes)}.`
    )
  }
  const data = Buffer.from(await response.arrayBuffer())
  if (data.byteLength > maxBytes) {
    throw new DownloadError(
      url,
      `the image is ${megabytes(data.byteLength)}; the limit is ${megabytes(maxBytes)}.`
    )
  }
  return { data, mime }
}

/**
 * POST bytes to a Convex upload URL (from `files.generateUploadUrl`) and
 * return the new storage id.
 */
export async function uploadToStorage(
  uploadUrl: string,
  data: Uint8Array,
  contentType: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const response = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Blob([new Uint8Array(data)], { type: contentType }),
  })
  if (!response.ok) {
    throw new Error(
      `Convex storage upload failed: HTTP ${response.status} ${await response.text().catch(() => "")}`.trim()
    )
  }
  const body: unknown = await response.json()
  const storageId =
    typeof body === "object" && body !== null && "storageId" in body
      ? Reflect.get(body, "storageId")
      : undefined
  if (typeof storageId !== "string" || storageId === "") {
    throw new Error("Convex storage upload returned no storageId")
  }
  return storageId
}
