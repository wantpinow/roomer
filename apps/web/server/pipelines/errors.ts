// A failure the caller (agent or UI) can fix — an unknown camera id, a
// missing layout — raised by the web server's own pipelines and tool code.
// The MCP layer turns it into an `isError` result, the API routes into a
// 4xx; the message is written for whoever asked.

export type RoomerErrorCode = "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT"

export class RoomerError extends Error {
  override readonly name = "RoomerError"
  readonly code: RoomerErrorCode

  constructor(code: RoomerErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export function notFound(message: string): RoomerError {
  return new RoomerError("NOT_FOUND", message)
}

export function invalidInput(message: string): RoomerError {
  return new RoomerError("INVALID_INPUT", message)
}
