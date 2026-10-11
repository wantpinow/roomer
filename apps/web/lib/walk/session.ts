// Walk mode's states, as a pure reducer. You are either walking (the mouse
// captured by pointer lock, or — where a browser refuses the lock — keys
// and drag-to-look while the view is focused), paused (the view held, a
// card with the controls you need a cursor for), or out of walk mode.
//
// Releasing the mouse never leaves walk mode: Esc while walking pauses;
// Esc while paused exits. A first visit starts paused, so the click that
// starts walking is the user gesture pointer lock needs.

export type WalkPhase = "paused" | "walking" | "exited"

/** How walking is driven: captured mouse, or keys and drag-to-look. */
export type WalkControl = "lock" | "keys"

export interface WalkSession {
  phase: WalkPhase
  control: WalkControl
  /** Has walked at least once (the card says "start" until then). */
  started: boolean
  /** When the walk last paused because the mouse was released, ms. */
  lockLostAt: number | null
}

export type WalkSessionEvent =
  /** Walk mode opened: paused, waiting for the first click. */
  | { type: "enter" }
  /** The user asked to walk (click on the view, "Resume walking"). */
  | { type: "resume" }
  /** The browser captured the mouse. */
  | { type: "lockAcquired" }
  /** The browser released the mouse (Esc, alt-tab, …). */
  | { type: "lockLost"; at: number }
  /** The browser refused to capture the mouse (cooldown, iframe, …). */
  | { type: "lockRefused" }
  /** Escape pressed while the page still saw it. */
  | { type: "escape"; at: number }
  /** "Exit to plan". */
  | { type: "exit" }

/**
 * Chrome both releases the lock and (sometimes) delivers the Escape that
 * released it; an Escape this soon after losing the lock is that same key
 * press, not a second one.
 */
export const ESCAPE_ECHO_MS = 500

export const INITIAL_WALK_SESSION: WalkSession = {
  phase: "paused",
  control: "keys",
  started: false,
  lockLostAt: null,
}

export function walkSession(
  state: WalkSession,
  event: WalkSessionEvent
): WalkSession {
  if (event.type === "enter") return INITIAL_WALK_SESSION
  if (state.phase === "exited") return state
  switch (event.type) {
    case "resume":
      return state.phase === "paused"
        ? { ...state, phase: "walking", control: "keys", started: true }
        : state
    case "lockAcquired":
      return { ...state, phase: "walking", control: "lock", started: true }
    case "lockLost":
      return state.phase === "walking" && state.control === "lock"
        ? { ...state, phase: "paused", control: "keys", lockLostAt: event.at }
        : state
    case "lockRefused":
      return state.phase === "walking" ? { ...state, control: "keys" } : state
    case "escape":
      if (state.phase === "walking") {
        return { ...state, phase: "paused", control: "keys" }
      }
      if (
        state.lockLostAt !== null &&
        event.at - state.lockLostAt < ESCAPE_ECHO_MS
      ) {
        return state
      }
      return { ...state, phase: "exited" }
    case "exit":
      return { ...state, phase: "exited" }
  }
}
