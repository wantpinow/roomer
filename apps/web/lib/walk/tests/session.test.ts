import { describe, expect, it } from "vitest"

import {
  ESCAPE_ECHO_MS,
  INITIAL_WALK_SESSION,
  walkSession,
  type WalkSession,
  type WalkSessionEvent,
} from "../session"

const run = (...events: WalkSessionEvent[]): WalkSession =>
  events.reduce(walkSession, INITIAL_WALK_SESSION)

describe("walkSession", () => {
  it("starts paused, waiting for the first click", () => {
    expect(run({ type: "enter" })).toEqual({
      phase: "paused",
      control: "keys",
      started: false,
      lockLostAt: null,
      posture: "standing",
    })
  })

  it("walks with the mouse captured once the lock is granted", () => {
    const walking = run({ type: "resume" }, { type: "lockAcquired" })
    expect(walking).toMatchObject({
      phase: "walking",
      control: "lock",
      started: true,
    })
  })

  it("walks with keys and drag-to-look when the lock is refused", () => {
    expect(run({ type: "resume" }, { type: "lockRefused" })).toMatchObject({
      phase: "walking",
      control: "keys",
    })
  })

  it("pauses — never exits — when the mouse is released", () => {
    const paused = run(
      { type: "resume" },
      { type: "lockAcquired" },
      { type: "lockLost", at: 1000 }
    )
    expect(paused).toMatchObject({
      phase: "paused",
      control: "keys",
      lockLostAt: 1000,
    })
  })

  it("ignores the Escape that released the lock", () => {
    const paused = run(
      { type: "resume" },
      { type: "lockAcquired" },
      { type: "lockLost", at: 1000 },
      { type: "escape", at: 1000 + ESCAPE_ECHO_MS - 1 }
    )
    expect(paused.phase).toBe("paused")
  })

  it("exits on a second Escape while paused", () => {
    const exited = run(
      { type: "resume" },
      { type: "lockAcquired" },
      { type: "lockLost", at: 1000 },
      { type: "escape", at: 1000 + ESCAPE_ECHO_MS + 1 }
    )
    expect(exited.phase).toBe("exited")
  })

  it("pauses on Escape while walking with keys, then exits on the next", () => {
    const paused = run({ type: "resume" }, { type: "escape", at: 5 })
    expect(paused.phase).toBe("paused")
    expect(walkSession(paused, { type: "escape", at: 6 }).phase).toBe("exited")
  })

  it("exits from the first-visit card on Escape", () => {
    expect(run({ type: "escape", at: 0 }).phase).toBe("exited")
  })

  it("exits from anywhere with Exit to plan", () => {
    expect(run({ type: "exit" }).phase).toBe("exited")
    expect(run({ type: "resume" }, { type: "exit" }).phase).toBe("exited")
  })

  it("only resumes from paused", () => {
    const walking = run({ type: "resume" }, { type: "lockAcquired" })
    expect(walkSession(walking, { type: "resume" })).toBe(walking)
  })

  it("ignores lock changes that don't apply", () => {
    // Losing a lock you weren't using, or a refusal while paused.
    const paused = run({ type: "enter" })
    expect(walkSession(paused, { type: "lockLost", at: 1 })).toBe(paused)
    expect(walkSession(paused, { type: "lockRefused" })).toBe(paused)
    const keys = run({ type: "resume" })
    expect(walkSession(keys, { type: "lockLost", at: 1 })).toBe(keys)
  })

  it("stays exited until entered again", () => {
    const exited = run({ type: "exit" })
    expect(walkSession(exited, { type: "resume" })).toBe(exited)
    expect(walkSession(exited, { type: "lockAcquired" })).toBe(exited)
    expect(walkSession(exited, { type: "enter" })).toEqual(INITIAL_WALK_SESSION)
  })

  describe("posture", () => {
    const walking = run({ type: "resume" }, { type: "lockAcquired" })

    it("toggles sitting with C and lying with Z", () => {
      const sitting = walkSession(walking, { type: "sit" })
      expect(sitting.posture).toBe("sitting")
      expect(walkSession(sitting, { type: "sit" }).posture).toBe("standing")
      const lying = walkSession(walking, { type: "lie" })
      expect(lying.posture).toBe("lying")
      expect(walkSession(lying, { type: "lie" }).posture).toBe("standing")
    })

    it("switches straight from one posture to the other", () => {
      const sitting = walkSession(walking, { type: "sit" })
      expect(walkSession(sitting, { type: "lie" }).posture).toBe("lying")
      const lying = walkSession(walking, { type: "lie" })
      expect(walkSession(lying, { type: "sit" }).posture).toBe("sitting")
    })

    it("stands up, and standing while standing changes nothing", () => {
      const sitting = walkSession(walking, { type: "sit" })
      expect(walkSession(sitting, { type: "stand" }).posture).toBe("standing")
      expect(walkSession(walking, { type: "stand" })).toBe(walking)
    })

    it("works from the pause card and survives pausing", () => {
      const paused = walkSession(walking, { type: "lockLost", at: 1 })
      const sittingPaused = walkSession(paused, { type: "sit" })
      expect(sittingPaused).toMatchObject({
        phase: "paused",
        posture: "sitting",
      })
      const resumed = walkSession(sittingPaused, { type: "resume" })
      expect(resumed).toMatchObject({ phase: "walking", posture: "sitting" })
    })

    it("starts standing again on re-entry, and ignores postures once exited", () => {
      const sitting = walkSession(walking, { type: "sit" })
      expect(walkSession(sitting, { type: "enter" }).posture).toBe("standing")
      const exited = run({ type: "exit" })
      expect(walkSession(exited, { type: "sit" })).toBe(exited)
    })
  })
})
