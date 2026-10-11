import type { Camera } from "@roomer/core"

// Taking a photo in walk mode: freeze what the walker sees into an ordinary
// room Camera, so the photoreal pipeline (or the room's saved cameras) can
// use it like any other viewpoint.

/** What the walk camera sees right now, in room millimetres. */
export interface WalkViewSnapshot {
  /** Eye position [x, y, z], mm, without head-bob. */
  position: [number, number, number]
  /** Unit look direction in room space (y up), pitch included. */
  direction: [number, number, number]
  /** The camera's vertical field of view, degrees. */
  fov: number
  /** Viewport width / height. */
  aspect: number
}

export type WalkCameraKind = "photo" | "view"

/** "14:05" — local time, zero-padded. */
export function timeLabel(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** How far ahead of the eye the camera's target sits, mm. */
const TARGET_DISTANCE = 1000

/**
 * A rectilinear Camera looking exactly where the walker looks: eye
 * position, a target 1 m along the view (pitch included), the view's
 * vertical fov. Named "Walk photo 14:05" (or "Walk view 14:05" for a saved
 * viewpoint, id `walk-<timestamp>`), with an id unique to the moment.
 */
export function walkCamera(
  view: WalkViewSnapshot,
  at: Date,
  kind: WalkCameraKind = "photo"
): Camera {
  const [px, py, pz] = view.position
  const [dx, dy, dz] = view.direction
  const length = Math.hypot(dx, dy, dz) || 1
  const position: [number, number, number] = [
    Math.round(px),
    Math.round(py),
    Math.round(pz),
  ]
  const target: [number, number, number] = [
    Math.round(px + (dx / length) * TARGET_DISTANCE),
    Math.round(py + (dy / length) * TARGET_DISTANCE),
    Math.round(pz + (dz / length) * TARGET_DISTANCE),
  ]
  const fov = Math.min(120, Math.max(10, Math.round(view.fov * 10) / 10))
  return {
    // Saved viewpoints join the room's cameras as walk-<timestamp>.
    id: kind === "view" ? `walk-${at.getTime()}` : `walk-photo-${at.getTime()}`,
    name: `Walk ${kind} ${timeLabel(at)}`,
    position,
    target,
    fov,
    projection: "rectilinear",
  }
}

/**
 * Render size for a viewport shape: landscape 1536×1024, portrait
 * 1024×1536, roughly square (within 1.2:1) 1024×1024.
 */
export function photoSize(aspect: number): { width: number; height: number } {
  if (aspect > 1.2) return { width: 1536, height: 1024 }
  if (aspect < 1 / 1.2) return { width: 1024, height: 1536 }
  return { width: 1024, height: 1024 }
}

/** A room holds at most this many saved cameras (core's RoomSpec). */
export const MAX_ROOM_CAMERAS = 50

/** A photo the host is rendering from walk mode. */
export interface WalkPhoto {
  /** The render's id. */
  id: string
  status: "pending" | "done" | "failed"
  /** The finished image, once done. */
  url?: string | null
  /** Why it failed. */
  error?: string
}

/** What a host reports back from taking a photo or saving a view. */
export type WalkActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string }
