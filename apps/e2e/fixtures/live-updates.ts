/**
 * Control over when the page sees live query updates.
 *
 * The Convex client gets query results as `Transition` (or, for big ones,
 * `TransitionChunk`) messages on its sync WebSocket; mutation results come
 * back on the same socket as `MutationResponse`. Proxying that socket lets a
 * spec hold query updates back while everything else flows — the only
 * deterministic way to put the page in the "the server has moved on, the
 * page hasn't heard yet" state that the backend's revision check exists for.
 */
import type { Page, WebSocketRoute } from "@playwright/test"

const SYNC_SOCKET = /\/api\/[^/]+\/sync$/

const HELD_TYPES = new Set(["Transition", "TransitionChunk"])

function messageType(message: string | Buffer): string | undefined {
  if (typeof message !== "string") return undefined
  try {
    const parsed: unknown = JSON.parse(message)
    if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
      return typeof parsed.type === "string" ? parsed.type : undefined
    }
  } catch {
    // Not JSON: never a query update.
  }
  return undefined
}

export interface LiveUpdates {
  /** From now on, keep query updates from reaching the page. */
  hold(): void
  /** Deliver everything held, in order, and stop holding. */
  release(): void
  /** How many query updates are waiting. */
  readonly held: number
}

/**
 * Proxy the page's Convex sync socket. Call before `page.goto`: only sockets
 * opened afterwards go through the proxy.
 */
export async function proxyLiveUpdates(page: Page): Promise<LiveUpdates> {
  let holding = false
  const queue: { socket: WebSocketRoute; message: string | Buffer }[] = []

  await page.routeWebSocket(SYNC_SOCKET, (socket) => {
    const server = socket.connectToServer()
    // Page → server flows untouched (no `socket.onMessage` handler); server
    // → page goes through here.
    server.onMessage((message) => {
      const type = messageType(message)
      if (holding && type !== undefined && HELD_TYPES.has(type)) {
        queue.push({ socket, message })
      } else {
        socket.send(message)
      }
    })
  })

  return {
    hold: () => {
      holding = true
    },
    release: () => {
      holding = false
      for (const { socket, message } of queue.splice(0)) socket.send(message)
    },
    get held() {
      return queue.length
    },
  }
}
