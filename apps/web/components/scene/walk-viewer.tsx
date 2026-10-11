"use client"

import { directionOf } from "@roomer/core/geometry"
import { Canvas, useThree } from "@react-three/fiber"
import { cn } from "@roomer/ui/lib/utils"
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"

import type { Camera } from "@roomer/core"

import type { SceneContent } from "@/lib/scene/types"
import { isWalkKey } from "@/lib/walk/keys"
import { verticalFovFor, WALK_HFOV } from "@/lib/walk/lens"
import type { WalkBump } from "@/lib/walk/physics"
import {
  walkCamera,
  type WalkActionResult,
  type WalkPhoto,
  type WalkViewSnapshot,
} from "@/lib/walk/photo"
import {
  DEFAULT_STATURE_MM,
  parseStature,
  STATURE_RANGE_IN,
  statureInches,
  stepStature,
  walkerSize,
} from "@/lib/walk/stature"
import { INITIAL_WALK_SESSION, walkSession } from "@/lib/walk/session"
import { buildWalkWorld } from "@/lib/walk/world"

import { passCanvasProps } from "./canvas-config"
import { RoomScene } from "./room-scene"
import { type LookDelta, WalkController } from "./walk-controller"
import { WalkingHud } from "./walk-hud"
import { WalkPauseCard } from "./walk-pause-card"
import { type WalkNote, WalkPhotoHud } from "./walk-photo-hud"

/** How long a note ("Photo taken — rendering…") stays up, ms. */
const NOTE_MS = 4000
/** How long a finished photo's thumbnail stays up, ms. */
const READY_MS = 8000
/** The walking hint fades after this long without a key press, ms. */
const HINT_MS = 3000
/** How long the height readout shows after a change while walking, ms. */
const HEIGHT_READOUT_MS = 1500

/** Where the walker's height setting is remembered (per browser). */
const STATURE_KEY = "roomer.walk.statureMm"

function storedStature(): number | null {
  try {
    return parseStature(window.localStorage.getItem(STATURE_KEY))
  } catch {
    return null
  }
}

function storeStature(statureMm: number): void {
  try {
    window.localStorage.setItem(STATURE_KEY, String(statureMm))
  } catch {
    // Private mode or blocked storage: the setting just isn't remembered.
  }
}

/** Starting vertical fov (a 16:9 viewport); `WalkLens` keeps it right. */
const INITIAL_WALK_VFOV = Math.round(verticalFovFor(WALK_HFOV, 16 / 9))

/**
 * Keeps the walk camera's horizontal field of view at WALK_HFOV whatever
 * shape the stage is, by deriving the vertical fov from the viewport.
 */
function WalkLens() {
  const get = useThree((state) => state.get)
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  useEffect(() => {
    const { camera } = get()
    if (!("isPerspectiveCamera" in camera) || height <= 0) return
    camera.fov = verticalFovFor(WALK_HFOV, width / height)
    camera.updateProjectionMatrix()
  }, [get, width, height])
  return null
}

/** What a host's photo or save-view handler returns (now or later). */
type WalkActionOutcome =
  | void
  | WalkActionResult
  | Promise<WalkActionResult | void>

export interface WalkViewerProps {
  /** The room and what's in it (a RoomViewer `scene` works as-is). */
  scene: Pick<SceneContent, "room" | "placements" | "assets">
  /**
   * Called each time the walker bumps into something (no message is shown;
   * useful for tests and debugging).
   */
  onBump?: (bump: WalkBump) => void
  /**
   * Called when the user leaves walk mode ("Exit to plan", or Esc while
   * paused). Releasing the mouse only pauses. Without it, exiting returns
   * to the start card.
   */
  onExit?: () => void
  /**
   * The walker's starting height, mm (default: the height last chosen in
   * this browser, else 6 ft). −/= or the pause card change it from there.
   */
  statureMm?: number
  /**
   * Take a photo (Enter while walking, "Take photo" while paused): the
   * current view as a rectilinear Camera (eye position, 1 m ahead along the
   * look direction, the view's vertical fov) and the viewport's aspect.
   * Resolve to a failure to have it shown.
   */
  onPhoto?: (camera: Camera, aspect: number) => WalkActionOutcome
  /**
   * Photos the host is rendering for this walk: pending ones show
   * "rendering…", a finished one shows as a thumbnail for a few seconds.
   */
  photos?: readonly WalkPhoto[]
  /** Open a finished photo in the host (default: its image in a new tab). */
  onOpenPhoto?: (renderId: string) => void
  /** Save the current view as a room camera (Shift+Enter, pause card). */
  onSaveView?: (camera: Camera) => WalkActionOutcome
  className?: string
}

/**
 * First-person walk through a room at the walker's eye height, in the clay
 * look with the ceiling on. It opens paused ("Click to start walking"); a
 * click captures the mouse and you walk — WASD/arrows, Space to jump,
 * Shift to run, Enter for a photo. Esc releases the mouse and pauses: the
 * view holds, dimmed, under a card with the height, photo, save-view and
 * exit controls; Esc again leaves walk mode. Where a browser refuses
 * pointer lock, you walk with the keys and drag to look (Q/E turn).
 */
export function WalkViewer({
  scene,
  onBump,
  onExit,
  statureMm,
  onPhoto,
  photos,
  onOpenPhoto,
  onSaveView,
  className,
}: WalkViewerProps) {
  const { room, placements, assets } = scene
  const [session, dispatch] = useReducer(walkSession, INITIAL_WALK_SESSION)
  const walking = session.phase === "walking"

  // --- Height -------------------------------------------------------------
  const [stature, setStature] = useState(
    () => statureMm ?? storedStature() ?? DEFAULT_STATURE_MM
  )
  const [heightReadout, setHeightReadout] = useState(false)
  const changeStature = useCallback((inches: number) => {
    setStature((current) => {
      const next = stepStature(current, inches)
      if (next !== current) storeStature(next)
      return next
    })
  }, [])
  const world = useMemo(
    () => buildWalkWorld({ room, placements, assets, statureMm: stature }),
    [room, placements, assets, stature]
  )
  useEffect(() => {
    if (!heightReadout) return
    const timer = setTimeout(() => setHeightReadout(false), HEIGHT_READOUT_MS)
    return () => clearTimeout(timer)
  }, [heightReadout, stature])

  const [spawnX, spawnZ] = world.spawn.position
  const spawnHeading = world.spawn.heading
  const content = useMemo((): SceneContent => {
    const [dx, dz] = directionOf(spawnHeading)
    // Only seeds the scene; WalkController drives the real camera.
    const eye = walkerSize().eyeHeight
    return {
      room,
      placements,
      assets,
      pass: "clay",
      showCeiling: true,
      view: {
        kind: "camera",
        camera: {
          id: "walk",
          name: "Walk",
          position: [Math.round(spawnX), eye, Math.round(spawnZ)],
          target: [
            Math.round(spawnX + dx * 1000),
            eye,
            Math.round(spawnZ + dz * 1000),
          ],
          fov: INITIAL_WALK_VFOV,
        },
      },
    }
  }, [spawnX, spawnZ, spawnHeading, room, placements, assets])

  // --- Session: walking, paused, exited -------------------------------------
  const root = useRef<HTMLDivElement>(null)
  const keys = useRef(new Set<string>())
  const look = useRef<LookDelta>({ dx: 0, dy: 0 })
  const dragging = useRef(false)
  const onExitRef = useRef(onExit)
  const onBumpRef = useRef(onBump)
  useEffect(() => {
    onExitRef.current = onExit
    onBumpRef.current = onBump
  }, [onExit, onBump])

  useEffect(() => {
    if (session.phase !== "exited") return
    keys.current.clear()
    if (document.pointerLockElement === root.current) document.exitPointerLock()
    if (onExitRef.current) onExitRef.current()
    else dispatch({ type: "enter" })
  }, [session.phase])

  useEffect(() => {
    if (walking) return
    keys.current.clear()
    // Paused by a key the browser didn't treat as "release the mouse"
    // (Esc delivered to the page, automation): release it ourselves.
    if (document.pointerLockElement === root.current) document.exitPointerLock()
  }, [walking])

  /** Ask for the mouse; a refusal (cooldown, iframe) means keys + drag. */
  const requestLock = useCallback(() => {
    const el = root.current
    if (!el || document.pointerLockElement === el) return
    try {
      const request: Promise<void> | undefined = el.requestPointerLock()
      request?.catch(() => dispatch({ type: "lockRefused" }))
    } catch {
      dispatch({ type: "lockRefused" })
    }
  }, [])

  const resume = useCallback(() => {
    dispatch({ type: "resume" })
    // Keys need the focus whether or not the mouse is captured.
    root.current?.focus({ preventScroll: true })
    requestLock()
  }, [requestLock])

  const exit = useCallback(() => dispatch({ type: "exit" }), [])

  useEffect(() => {
    const el = root.current
    const onChange = () => {
      if (el !== null && document.pointerLockElement === el) {
        dispatch({ type: "lockAcquired" })
      } else {
        dispatch({ type: "lockLost", at: performance.now() })
      }
    }
    const onError = () => dispatch({ type: "lockRefused" })
    const onMove = (event: MouseEvent) => {
      if (el === null || document.pointerLockElement !== el) return
      look.current.dx += event.movementX
      look.current.dy += event.movementY
    }
    document.addEventListener("pointerlockchange", onChange)
    document.addEventListener("pointerlockerror", onError)
    document.addEventListener("mousemove", onMove)
    return () => {
      document.removeEventListener("pointerlockchange", onChange)
      document.removeEventListener("pointerlockerror", onError)
      document.removeEventListener("mousemove", onMove)
      if (el !== null && document.pointerLockElement === el) {
        document.exitPointerLock()
      }
    }
  }, [])

  const takeLook = useCallback((): LookDelta => {
    const delta = { ...look.current }
    look.current = { dx: 0, dy: 0 }
    return delta
  }, [])

  // --- The walking hint -----------------------------------------------------
  const lastKey = useRef(0)
  const [hintActive, setHintActive] = useState(true)
  const pokeHint = useCallback(() => {
    lastKey.current = Date.now()
    setHintActive(true)
  }, [])
  useEffect(() => {
    if (!hintActive || !walking) return
    let timer: ReturnType<typeof setTimeout>
    const check = () => {
      const left = HINT_MS - (Date.now() - lastKey.current)
      if (left <= 0) setHintActive(false)
      else timer = setTimeout(check, left)
    }
    timer = setTimeout(check, HINT_MS)
    return () => clearTimeout(timer)
  }, [hintActive, walking])

  // --- Photos ---------------------------------------------------------------
  const readView = useRef<(() => WalkViewSnapshot) | null>(null)
  const registerView = useCallback((read: () => WalkViewSnapshot) => {
    readView.current = read
  }, [])
  const [flashing, setFlashing] = useState(false)
  const [note, setNote] = useState<WalkNote | null>(null)
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set())
  const ready =
    photos?.find((p) => p.status === "done" && p.url && !seen.has(p.id)) ?? null
  const failed =
    photos?.find((p) => p.status === "failed" && !seen.has(p.id)) ?? null
  const rendering = photos?.some((p) => p.status === "pending") ?? false
  const shownNote: WalkNote | null =
    note ??
    (failed
      ? {
          text: `The photo didn't render${failed.error ? `: ${failed.error}` : "."}`,
          tone: "error",
        }
      : rendering
        ? { text: "Photo taken — rendering…", tone: "info" }
        : null)

  useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(null), NOTE_MS)
    return () => clearTimeout(timer)
  }, [note])
  useEffect(() => {
    if (!flashing) return
    const timer = setTimeout(() => setFlashing(false), 60)
    return () => clearTimeout(timer)
  }, [flashing])
  // Finished (or failed) photos are shown once, for a few seconds.
  const shownId = ready?.id ?? failed?.id
  useEffect(() => {
    if (!shownId) return
    const timer = setTimeout(
      () => setSeen((ids) => new Set(ids).add(shownId)),
      ready ? READY_MS : NOTE_MS
    )
    return () => clearTimeout(timer)
  }, [shownId, ready])

  const report = useCallback(
    (result: WalkActionResult | void, success?: string) => {
      if (result && !result.ok) setNote({ text: result.message, tone: "error" })
      else if (result?.message) setNote({ text: result.message, tone: "info" })
      else if (success) setNote({ text: success, tone: "info" })
    },
    []
  )
  const failedAction = useCallback((error: unknown) => {
    setNote({
      text: error instanceof Error ? error.message : "Something went wrong.",
      tone: "error",
    })
  }, [])

  const takePhoto = useCallback(() => {
    const read = readView.current
    if (!onPhoto || !read) return
    // The camera is read straight from the walk (the scrim isn't in it: the
    // photo is rendered server-side from this viewpoint).
    const view = read()
    setFlashing(true)
    setNote({ text: "Photo taken — rendering…", tone: "info" })
    Promise.resolve(onPhoto(walkCamera(view, new Date(), "photo"), view.aspect))
      .then((result) => report(result))
      .catch(failedAction)
  }, [onPhoto, report, failedAction])

  const saveView = useCallback(() => {
    const read = readView.current
    if (!onSaveView || !read) return
    const camera = walkCamera(read(), new Date(), "view")
    Promise.resolve(onSaveView(camera))
      .then((result) =>
        report(result, `Saved “${camera.name}” to the room's cameras`)
      )
      .catch(failedAction)
  }, [onSaveView, report, failedAction])

  const handleBump = useCallback((b: WalkBump) => {
    onBumpRef.current?.(b)
  }, [])

  // --- Input ----------------------------------------------------------------
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!walking || session.control === "lock") return
    // Walking without the mouse captured: try again (the click is a user
    // gesture), and drag to look meanwhile.
    requestLock()
    dragging.current = true
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Not an active pointer (synthetic events): dragging still works
      // while the pointer stays over the view.
    }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || document.pointerLockElement === root.current) {
      return
    }
    look.current.dx += event.movementX
    look.current.dy += event.movementY
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const height = (inches: number) => {
    changeStature(inches)
    if (walking) setHeightReadout(true)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (walking) pokeHint()
    if (event.code === "Escape") {
      event.preventDefault()
      dispatch({ type: "escape", at: performance.now() })
      return
    }
    if (event.code === "Minus" || event.code === "NumpadSubtract") {
      event.preventDefault()
      height(-1)
      return
    }
    if (event.code === "Equal" || event.code === "NumpadAdd") {
      event.preventDefault()
      height(1)
      return
    }
    // Paused: the card's buttons have the keyboard (Enter presses them).
    if (!walking) return
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      event.preventDefault()
      if (event.repeat) return
      if (event.shiftKey) saveView()
      else takePhoto()
      return
    }
    if (!isWalkKey(event.code)) return
    event.preventDefault()
    keys.current.add(event.code)
  }
  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    keys.current.delete(event.code)
  }

  // The 3D view only re-renders when the room or walk does (not on HUD
  // notes, flashes or hint fades).
  const canvas = useMemo(
    () => (
      <Canvas
        {...passCanvasProps("clay")}
        dpr={[1, 1.5]}
        camera={{ fov: INITIAL_WALK_VFOV, near: 0.05, far: 60 }}
      >
        <WalkLens />
        <RoomScene scene={content} externalCamera fast />
        <WalkController
          world={world}
          keys={keys}
          takeLook={takeLook}
          active={walking}
          onBump={handleBump}
          registerView={registerView}
        />
      </Canvas>
    ),
    [content, world, takeLook, walking, handleBump, registerView]
  )

  return (
    <div
      ref={root}
      tabIndex={0}
      aria-label="First-person walk view"
      data-walk-viewer={session.phase}
      data-walk-control={session.control}
      className={cn(
        "@container relative h-full w-full outline-none",
        walking ? "cursor-crosshair" : "cursor-default",
        className
      )}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={(event) => {
        // Focus moving into the pause card stays "in" the walk.
        if (event.currentTarget.contains(event.relatedTarget)) return
        keys.current.clear()
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {canvas}
      {walking ? (
        <WalkingHud
          hintActive={hintActive}
          heightReadout={heightReadout ? world.player : null}
          dragToLook={session.control === "keys"}
        />
      ) : (
        <div
          data-walk-scrim
          // A click anywhere off the card resumes (and captures the mouse).
          onClick={resume}
          className="absolute inset-0 grid place-items-center bg-paper/35 backdrop-blur-[3px] transition-opacity"
        >
          <WalkPauseCard
            started={session.started}
            player={world.player}
            canGrow={statureInches(stature) < STATURE_RANGE_IN.max}
            canShrink={statureInches(stature) > STATURE_RANGE_IN.min}
            onTaller={() => height(1)}
            onShorter={() => height(-1)}
            onResume={resume}
            onExit={exit}
            {...(onPhoto ? { onPhoto: takePhoto } : {})}
            {...(onSaveView ? { onSaveView: saveView } : {})}
          />
        </div>
      )}
      <WalkPhotoHud
        flashing={flashing}
        note={shownNote}
        ready={ready}
        {...(onOpenPhoto ? { onOpen: (p) => onOpenPhoto(p.id) } : {})}
      />
    </div>
  )
}
