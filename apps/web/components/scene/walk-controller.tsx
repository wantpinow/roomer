"use client"

import { bearingOf } from "@roomer/core/geometry"
import { useFrame, useThree } from "@react-three/fiber"
import { type RefObject, useEffect, useRef } from "react"
import { Euler, Vector3 } from "three"

import { inputFromKeys, turnFromKeys } from "@/lib/walk/keys"
import {
  advanceWalk,
  createWalkState,
  eyeHeight,
  IDLE,
  reseat,
  teleport,
  type WalkBump,
  type WalkInput,
  type WalkState,
} from "@/lib/walk/physics"
import type { WalkViewSnapshot } from "@/lib/walk/photo"
import type { WalkWorld } from "@/lib/walk/world"

/** Dev-only handle for tests and agents driving the walk without a mouse. */
export interface RoomerWalkDebug {
  world: WalkWorld
  state(): WalkState
  /** Where the walker is: plan mm, feet/eye mm, heading degrees. */
  position(): {
    x: number
    z: number
    feet: number
    eye: number
    heading: number
    grounded: boolean
  }
  teleport(
    x: number,
    z: number,
    options?: { heading?: number; feet?: number }
  ): void
  /** Simulates `seconds` with a fixed input, synchronously, at 60 fps. */
  step(input: Partial<WalkInput>, seconds: number): WalkState
}

declare global {
  interface Window {
    __roomerWalk?: RoomerWalkDebug
  }
}

const DEG = Math.PI / 180
const NO_KEYS: ReadonlySet<string> = new Set()
/** Radians of turn per pixel of mouse movement. */
const LOOK_SENSITIVITY = 0.0022
/** Never look quite straight up or down. */
const MAX_PITCH = 85 * DEG

/** Mouse movement (pixels) not yet applied to the camera. */
export interface LookDelta {
  dx: number
  dy: number
}

/** Plan bearing the camera looks along (0 = −z, 90 = +x). */
function cameraHeading(direction: Vector3): number {
  return bearingOf([direction.x, direction.z])
}

/**
 * Drives the default camera from the walk simulation: reads the held keys
 * and the camera's heading each frame, advances the physics in fixed steps
 * and puts the camera at eye height (with head-bob).
 */
export function WalkController({
  world,
  keys,
  takeLook,
  active,
  onBump,
  registerView,
}: {
  world: WalkWorld
  /** `KeyboardEvent.code`s currently held. */
  keys: RefObject<Set<string>>
  /** Takes the mouse-look movement since the last frame (and resets it). */
  takeLook: () => LookDelta
  /**
   * Walking (true) or paused (false): while paused the simulation is
   * frozen — no keys, no mouse-look, no gravity — and the view held.
   */
  active: boolean
  onBump: (bump: WalkBump) => void
  /** Receives a function that reads the current view (for photos). */
  registerView?: (read: () => WalkViewSnapshot) => void
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const state = useRef<WalkState>(createWalkState(world))
  const pendingHeading = useRef<number | null>(world.spawn.heading)
  const lastBump = useRef<WalkBump | null>(null)
  const onBumpRef = useRef(onBump)
  useEffect(() => {
    onBumpRef.current = onBump
  }, [onBump])

  // A different room restarts the walk at its door; the same room rebuilt
  // (new stature, furniture moved by the agent) keeps the walker where they
  // are, re-grounded.
  const outline = useRef(JSON.stringify(world.outline))
  useEffect(() => {
    const next = JSON.stringify(world.outline)
    if (next === outline.current) {
      state.current = reseat(world, state.current)
    } else {
      outline.current = next
      state.current = createWalkState(world)
      pendingHeading.current = world.spawn.heading
      lastBump.current = null
    }
  }, [world])

  useEffect(() => {
    if (!registerView) return
    registerView(() => {
      const s = state.current
      const look = new Vector3()
      camera.getWorldDirection(look)
      return {
        // The eye without head-bob: photos shouldn't wobble.
        position: [
          s.position[0],
          s.feet + world.player.eyeHeight,
          s.position[1],
        ],
        direction: [look.x, look.y, look.z],
        fov: "isPerspectiveCamera" in camera ? camera.fov : 70,
        aspect: size.height > 0 ? size.width / size.height : 1,
      }
    })
  }, [registerView, camera, world, size])

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const handle: RoomerWalkDebug = {
      world,
      state: () => state.current,
      position: () => ({
        x: state.current.position[0],
        z: state.current.position[1],
        feet: state.current.feet,
        eye: eyeHeight(world, state.current),
        heading: state.current.heading,
        grounded: state.current.grounded,
      }),
      teleport: (x, z, options = {}) => {
        state.current = teleport(
          world,
          state.current,
          [x, z],
          options.heading ?? state.current.heading,
          options.feet
        )
        pendingHeading.current = state.current.heading
      },
      step: (input, seconds) => {
        const full: WalkInput = {
          ...IDLE,
          heading: state.current.heading,
          ...input,
        }
        for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
          state.current = advanceWalk(world, state.current, full, 1 / 60)
        }
        pendingHeading.current = state.current.heading
        return state.current
      },
    }
    window.__roomerWalk = handle
    return () => {
      if (window.__roomerWalk === handle) delete window.__roomerWalk
    }
  }, [world])

  const euler = useRef(new Euler(0, 0, 0, "YXZ"))
  const direction = useRef(new Vector3())

  useFrame((_, delta) => {
    const e = euler.current
    e.setFromQuaternion(camera.quaternion, "YXZ")
    if (pendingHeading.current !== null) {
      // Bearing h (clockwise on the plan) is a yaw of −h about +y.
      e.set(e.x, -pendingHeading.current * DEG, 0, "YXZ")
      pendingHeading.current = null
    }
    const held = active ? keys.current : NO_KEYS
    const turn = turnFromKeys(held, delta)
    if (turn !== 0) e.y -= turn * DEG
    const { dx, dy } = takeLook()
    if (active && (dx !== 0 || dy !== 0)) {
      e.y -= dx * LOOK_SENSITIVITY
      e.x = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, e.x - dy * LOOK_SENSITIVITY)
      )
    }
    camera.quaternion.setFromEuler(e)
    camera.getWorldDirection(direction.current)

    if (active) {
      state.current = advanceWalk(
        world,
        state.current,
        inputFromKeys(held, cameraHeading(direction.current)),
        delta
      )
    }
    // Placed every frame, paused or not, so a teleport (debug handle) or a
    // rebuilt world shows at once.
    const s = state.current
    camera.position.set(
      s.position[0] / 1000,
      eyeHeight(world, s) / 1000,
      s.position[1] / 1000
    )
    if (s.bump && s.bump !== lastBump.current) {
      lastBump.current = s.bump
      onBumpRef.current(s.bump)
    }
  })

  return null
}
