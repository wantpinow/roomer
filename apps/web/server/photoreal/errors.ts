// Typed failures for photoreal renders. Every message is safe to hand to the
// agent verbatim (it is relayed through MCP): it says what went wrong and
// what to do, and never contains the API key.

export const PHOTOREAL_ERROR_CODES = [
  "AUTH",
  "RATE_LIMIT",
  "MODERATION",
  "BAD_REQUEST",
  "TIMEOUT",
  "UPSTREAM",
] as const

export type PhotorealErrorCode = (typeof PHOTOREAL_ERROR_CODES)[number]

export interface PhotorealErrorOptions {
  /** Gateway model id the call was for. */
  model?: string
  /** HTTP status from the gateway, when there was one. */
  status?: number
  cause?: unknown
}

export class PhotorealError extends Error {
  override readonly name = "PhotorealError"
  readonly code: PhotorealErrorCode
  readonly model?: string
  readonly status?: number

  constructor(
    code: PhotorealErrorCode,
    message: string,
    options: PhotorealErrorOptions = {}
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause })
    this.code = code
    if (options.model !== undefined) this.model = options.model
    if (options.status !== undefined) this.status = options.status
  }

  /** Only upstream hiccups (5xx, dropped connections) are worth one retry. */
  get retryable(): boolean {
    return this.code === "UPSTREAM"
  }
}

export function isPhotorealError(error: unknown): error is PhotorealError {
  return error instanceof PhotorealError
}

const MAX_DETAIL_LENGTH = 300

// Moderation refusals arrive as plain 400s; only the wording tells them apart.
const MODERATION_PATTERN =
  /moderation|safety system|safety_violation|content[ _-]?policy|content[ _-]?filter|flagged|prohibited content|blocked due to/i

/**
 * Strip anything credential-shaped from upstream text: the literal secrets we
 * know about, bearer tokens and long key-like tokens.
 */
export function redactSecrets(
  text: string,
  secrets: readonly string[] = []
): string {
  let out = text
  for (const secret of secrets) {
    if (secret.length >= 8) out = out.split(secret).join("[redacted]")
  }
  return out
    .replace(/Bearer\s+[^\s"',;]+/gi, "Bearer [redacted]")
    .replace(/\b(?:vck|sk|key)[-_][A-Za-z0-9_-]{16,}\b/g, "[redacted]")
}

function tidy(text: string, secrets: readonly string[]): string {
  const clean = redactSecrets(text, secrets).replace(/\s+/g, " ").trim()
  return clean.length > MAX_DETAIL_LENGTH
    ? `${clean.slice(0, MAX_DETAIL_LENGTH - 1)}…`
    : clean
}

function readNumber(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined
  }
  const field: unknown = Reflect.get(value, key)
  return typeof field === "number" ? field : undefined
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined
  }
  const field: unknown = Reflect.get(value, key)
  return typeof field === "string" ? field : undefined
}

/** The AI SDK wraps retried calls in a RetryError; the last error matters. */
function unwrap(error: unknown): unknown {
  const last: unknown =
    typeof error === "object" && error !== null && "lastError" in error
      ? Reflect.get(error, "lastError")
      : undefined
  return last ?? error
}

const TIMEOUT_NAMES = new Set(["TimeoutError", "GatewayTimeoutError"])

export interface ToPhotorealErrorContext {
  model: string
  /** Values that must never appear in the message (the API key). */
  secrets?: readonly string[]
  timeoutMs?: number
}

/**
 * Map anything thrown by a gateway call (AI SDK errors, fetch failures,
 * aborts) onto a `PhotorealError` with an agent-readable message.
 */
export function toPhotorealError(
  thrown: unknown,
  { model, secrets = [], timeoutMs }: ToPhotorealErrorContext
): PhotorealError {
  if (thrown instanceof PhotorealError) return thrown
  const error = unwrap(thrown)
  if (error instanceof PhotorealError) return error

  const status = readNumber(error, "statusCode") ?? readNumber(error, "status")
  const name = readString(error, "name") ?? ""
  const rawMessage =
    readString(error, "message") ??
    (typeof error === "string" ? error : "unknown error")
  const detail = tidy(rawMessage, secrets)
  const base = { model, cause: thrown }
  const withStatus = status === undefined ? base : { ...base, status }

  if (TIMEOUT_NAMES.has(name) || status === 408 || status === 504) {
    const after = timeoutMs ? ` after ${Math.round(timeoutMs / 1000)}s` : ""
    return new PhotorealError(
      "TIMEOUT",
      `${model} did not finish${after}. Image models can be slow under load; try again, or use a faster model (openai/gpt-image-2.5-flare).`,
      withStatus
    )
  }
  if (status === 401 || status === 403) {
    return new PhotorealError(
      "AUTH",
      "The AI Gateway rejected the API key. Check AI_GATEWAY_API_KEY in the repo-root .env.local (or set PHOTOREAL_STUB=1 to render without it).",
      withStatus
    )
  }
  if (status === 429) {
    return new PhotorealError(
      "RATE_LIMIT",
      `${model} is rate limited right now. Wait a minute and try again. (${detail})`,
      withStatus
    )
  }
  if (MODERATION_PATTERN.test(rawMessage)) {
    return new PhotorealError(
      "MODERATION",
      `${model} refused the request on content-safety grounds. Rephrase the extra prompt or drop the reference that triggered it. (${detail})`,
      withStatus
    )
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return new PhotorealError(
      "BAD_REQUEST",
      `${model} rejected the request: ${detail}`,
      withStatus
    )
  }
  return new PhotorealError(
    "UPSTREAM",
    `${model} failed upstream${status ? ` (HTTP ${status})` : ""}: ${detail}`,
    withStatus
  )
}
