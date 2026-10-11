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

import type { SceneContent } from "@/lib/scene/types"
import { isWalkKey } from "@/lib/walk/keys"
import { verticalFovFor, WALK_HFOV } from "@/lib/walk/lens"
import type { WalkBump } from "@/lib/walk/physics"
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
    </div>
  )
}
