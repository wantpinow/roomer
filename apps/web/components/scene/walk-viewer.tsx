"use client"

import { directionOf } from "@roomer/core/geometry"
import { Canvas } from "@react-three/fiber"
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
import type { WalkBump } from "@/lib/walk/physics"
import { PLAYER } from "@/lib/walk/player"
import { buildWalkWorld } from "@/lib/walk/world"

import { passCanvasProps } from "./canvas-config"
import { RoomScene } from "./room-scene"
import { type LookDelta, WalkController } from "./walk-controller"
import { WalkHud, type WalkMode } from "./walk-hud"

/** Vertical field of view, degrees: a natural first-person view. */
const WALK_FOV = 70

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
  className,
}: WalkViewerProps) {
  const { room, placements, assets } = scene
  const world = useMemo(
    () => buildWalkWorld({ room, placements, assets }),
    [room, placements, assets]
  )
  const content = useMemo((): SceneContent => {
    const [x, z] = world.spawn.position
    const [dx, dz] = directionOf(world.spawn.heading)
    const eye = PLAYER.eyeHeight
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
          fov: WALK_FOV,
        },
      },
    }
  }, [world, room, placements, assets])

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
        "relative h-full w-full cursor-crosshair outline-none",
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
        camera={{ fov: WALK_FOV, near: 0.05, far: 60 }}
      >
        <RoomScene scene={content} externalCamera fast />
        <WalkController
          world={world}
          keys={keys}
          takeLook={takeLook}
          active={mode !== "idle"}
          onBump={handleBump}
        />
      </Canvas>
      <WalkHud mode={mode} />
    </div>
  )
}
