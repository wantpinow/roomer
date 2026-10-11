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
import { buildWalkWorld } from "@/lib/walk/world"

import { passCanvasProps } from "./canvas-config"
import { RoomScene } from "./room-scene"
import { type LookDelta, WalkController } from "./walk-controller"
import { WalkHud, type WalkMode } from "./walk-hud"
import { type WalkNote, WalkPhotoHud } from "./walk-photo-hud"

/** How long a note ("Photo taken — rendering…") stays up, ms. */
const NOTE_MS = 4000
/** How long a finished photo's thumbnail stays up, ms. */
const READY_MS = 8000

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

export interface WalkViewerProps {
  /** The room and what's in it (a RoomViewer `scene` works as-is). */
  scene: Pick<SceneContent, "room" | "placements" | "assets">
  /**
   * Called each time the walker bumps into something (no message is shown;
   * useful for tests and debugging).
   */
  onBump?: (bump: WalkBump) => void
  /** Called when the user leaves the walk (Esc). */
  onExit?: () => void
  /**
   * The walker's starting height, mm (default: the height last chosen in
   * this browser, else 6 ft). The HUD's −/+ control changes it from there.
   */
  statureMm?: number
  /**
   * Take a photo (shutter button or Enter): the current view as a
   * rectilinear Camera (eye position, 1 m ahead along the look direction,
   * the view's vertical fov) and the viewport's aspect. Resolve to a
   * failure to have it shown.
   */
  onPhoto?: (
    camera: Camera,
    aspect: number
  ) => void | Promise<WalkActionResult | void>
  /**
   * Photos the host is rendering for this walk: pending ones show
   * "rendering…", a finished one shows as a thumbnail for a few seconds.
   */
  photos?: readonly WalkPhoto[]
  /** Save the current view as a room camera (bookmark button, Shift+Enter). */
  onSaveView?: (camera: Camera) => void | Promise<WalkActionResult | void>
  className?: string
}

/**
 * First-person walk through a room at a six-footer's eye height, in the
 * clay look with the ceiling on. Click to capture the mouse (Esc releases
 * it); WASD/arrows move, Space jumps, Shift runs. Where the browser refuses
 * pointer lock (embedded or automated browsers), drag to look; the keys
 * work whenever the view is focused, with Q/E to turn.
 */
export function WalkViewer({
  scene,
  onBump,
  onExit,
  statureMm,
  onPhoto,
  photos,
  onSaveView,
  className,
}: WalkViewerProps) {
  const { room, placements, assets } = scene
  const [stature, setStature] = useState(
    () => statureMm ?? storedStature() ?? DEFAULT_STATURE_MM
  )
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
  const [spawnX, spawnZ] = world.spawn.position
  const spawnHeading = world.spawn.heading
  const content = useMemo((): SceneContent => {
    const [x, z] = [spawnX, spawnZ]
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
          position: [Math.round(x), eye, Math.round(z)],
          target: [Math.round(x + dx * 1000), eye, Math.round(z + dz * 1000)],
          fov: INITIAL_WALK_VFOV,
        },
      },
    }
  }, [spawnX, spawnZ, spawnHeading, room, placements, assets])

  const root = useRef<HTMLDivElement>(null)
  const keys = useRef(new Set<string>())
  const look = useRef<LookDelta>({ dx: 0, dy: 0 })
  const dragging = useRef(false)
  const locked = useRef(false)
  const [mode, setMode] = useState<WalkMode>("idle")
  const onExitRef = useRef(onExit)
  const onBumpRef = useRef(onBump)
  useEffect(() => {
    onExitRef.current = onExit
    onBumpRef.current = onBump
  }, [onExit, onBump])

  const exit = useCallback(() => {
    keys.current.clear()
    setMode("idle")
    onExitRef.current?.()
  }, [])

  // Pointer lock: mouse movement turns the view; leaving it (Esc) exits.
  useEffect(() => {
    const el = root.current
    const onChange = () => {
      const isLocked = el !== null && document.pointerLockElement === el
      if (isLocked) setMode("locked")
      else if (locked.current) exit()
      locked.current = isLocked
    }
    const onMove = (event: MouseEvent) => {
      if (el === null || document.pointerLockElement !== el) return
      look.current.dx += event.movementX
      look.current.dy += event.movementY
    }
    document.addEventListener("pointerlockchange", onChange)
    document.addEventListener("mousemove", onMove)
    return () => {
      document.removeEventListener("pointerlockchange", onChange)
      document.removeEventListener("mousemove", onMove)
      if (el !== null && document.pointerLockElement === el) {
        document.exitPointerLock()
      }
    }
  }, [exit])

  const takeLook = useCallback((): LookDelta => {
    const delta = { ...look.current }
    look.current = { dx: 0, dy: 0 }
    return delta
  }, [])

  // --- Photos -------------------------------------------------------------
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

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const el = root.current
    if (!el || document.pointerLockElement === el) return
    // Some browsers return a promise, some nothing; a refusal (iframes,
    // automation) leaves drag-to-look.
    try {
      const request: Promise<void> | undefined = el.requestPointerLock()
      request?.catch(() => undefined)
    } catch {
      // drag-to-look instead
    }
    dragging.current = true
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Not an active pointer (synthetic events): dragging still works
      // while the pointer stays over the view.
    }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || document.pointerLockElement === root.current)
      return
    look.current.dx += event.movementX
    look.current.dy += event.movementY
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.code === "Escape") {
      event.currentTarget.blur()
      exit()
      return
    }
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      event.preventDefault()
      if (event.repeat) return
      if (event.shiftKey) saveView()
      else takePhoto()
      return
    }
    if (event.code === "Minus" || event.code === "NumpadSubtract") {
      event.preventDefault()
      changeStature(-1)
      return
    }
    if (event.code === "Equal" || event.code === "NumpadAdd") {
      event.preventDefault()
      changeStature(1)
      return
    }
    if (!isWalkKey(event.code)) return
    event.preventDefault()
    keys.current.add(event.code)
    if (mode === "idle") setMode("keys")
  }
  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    keys.current.delete(event.code)
  }

  return (
    <div
      ref={root}
      tabIndex={0}
      aria-label="First-person walk view"
      data-walk-viewer={mode}
      className={cn(
        "@container relative h-full w-full cursor-crosshair outline-none",
        className
      )}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocus={() => setMode((m) => (m === "idle" ? "keys" : m))}
      onBlur={() => {
        keys.current.clear()
        setMode((m) => (m === "keys" ? "idle" : m))
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
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
          active={mode !== "idle"}
          onBump={handleBump}
          registerView={registerView}
        />
      </Canvas>
      <WalkHud
        mode={mode}
        player={world.player}
        onTaller={() => changeStature(1)}
        onShorter={() => changeStature(-1)}
        canGrow={statureInches(stature) < STATURE_RANGE_IN.max}
        canShrink={statureInches(stature) > STATURE_RANGE_IN.min}
      />
      <WalkPhotoHud
        flashing={flashing}
        note={shownNote}
        ready={ready}
        {...(onPhoto ? { onShutter: takePhoto } : {})}
        {...(onSaveView ? { onSaveView: saveView } : {})}
      />
    </div>
  )
}
