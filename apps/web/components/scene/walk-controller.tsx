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
import { postureTarget, type PostureTarget } from "@/lib/walk/posture"
import type { Posture } from "@/lib/walk/session"
import type { WalkWorld } from "@/lib/walk/world"

/** The camera as the walker sees it, in room mm and degrees. */
export interface WalkPose {
  posture: Posture
  /** "Sitting on Test three-seat sofa", or "Standing". */
  label: string
  eye: [number, number, number]
  heading: number
  pitch: number
}

/** Dev-only handle for tests and agents driving the walk without a mouse. */
export interface RoomerWalkDebug {
  world: WalkWorld
  state(): WalkState
  /**
   * Where the walker stands: plan mm, feet/eye mm, heading degrees. While
   * sitting or lying this is the standing pose they'll return to.
   */
  position(): {
    x: number
    z: number
    feet: number
    eye: number
    heading: number
    grounded: boolean
  }
  /** The view itself, whatever the posture (the target once it settles). */
  pose(): WalkPose
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
/** Lying on your back you can look along yourself, not into yourself. */
const LYING_MIN_PITCH = 5 * DEG
/** Sitting down, lying down and standing up take this long, seconds. */
const EASE_SECONDS = 0.4

/** Mouse movement (pixels) not yet applied to the camera. */
export interface LookDelta {
  dx: number
  dy: number
}

/** Plan bearing the camera looks along (0 = −z, 90 = +x). */
function cameraHeading(direction: Vector3): number {
  return bearingOf([direction.x, direction.z])
}

interface Look {
  /** Camera position, metres. */
  position: Vector3
  /** Euler "YXZ" yaw and pitch, radians. */
  yaw: number
  pitch: number
}

interface Ease {
  from: Look
  to: Look
  /** Seconds elapsed. */
  t: number
}

const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** Shortest-way angle interpolation (radians). */
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

/**
 * Drives the default camera from the walk simulation: reads the held keys
 * and the camera's heading each frame, advances the physics in fixed steps
 * and puts the camera at eye height (with head-bob). Sitting and lying
 * freeze the physics and ease the camera to the posture's viewpoint;
 * standing up eases back to exactly where you stood.
 */
export function WalkController({
  world,
  keys,
  takeLook,
  active,
  posture,
  onBump,
  onPosture,
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
  posture: Posture
  onBump: (bump: WalkBump) => void
  /** Reports what the walker sits or lies on (null when standing). */
  onPosture?: (target: PostureTarget | null) => void
  /** Receives a function that reads the current view (for photos). */
  registerView?: (read: () => WalkViewSnapshot) => void
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const state = useRef<WalkState>(createWalkState(world))
  const pendingHeading = useRef<number | null>(world.spawn.heading)
  const lastBump = useRef<WalkBump | null>(null)
  const onBumpRef = useRef(onBump)
  const onPostureRef = useRef(onPosture)
  useEffect(() => {
    onBumpRef.current = onBump
    onPostureRef.current = onPosture
  }, [onBump, onPosture])

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

  // --- Posture --------------------------------------------------------------
  const euler = useRef(new Euler(0, 0, 0, "YXZ"))
  const direction = useRef(new Vector3())
  const target = useRef<PostureTarget | null>(null)
  /** The standing look to return to (yaw/pitch, radians). */
  const standingLook = useRef<{ yaw: number; pitch: number } | null>(null)
  const ease = useRef<Ease | null>(null)
  const postureRef = useRef<Posture>("standing")

  const currentLook = (): Look => {
    const e = new Euler().setFromQuaternion(camera.quaternion, "YXZ")
    return { position: camera.position.clone(), yaw: e.y, pitch: e.x }
  }

  useEffect(() => {
    const was = postureRef.current
    postureRef.current = posture
    const s = state.current
    if (posture === "standing") {
      target.current = null
      onPostureRef.current?.(null)
      if (was === "standing") return
      const back = standingLook.current ?? { yaw: currentLook().yaw, pitch: 0 }
      standingLook.current = null
      ease.current = {
        from: currentLook(),
        to: {
          position: new Vector3(
            s.position[0] / 1000,
            (s.feet + world.player.eyeHeight) / 1000,
            s.position[1] / 1000
          ),
          yaw: back.yaw,
          pitch: back.pitch,
        },
        t: 0,
      }
      return
    }
    // Sitting or lying, from the standing pose (which the physics keeps).
    if (was === "standing" || !standingLook.current) {
      const look = currentLook()
      standingLook.current = { yaw: look.yaw, pitch: look.pitch }
    }
    const heading = bearingOf([
      -Math.sin(standingLook.current.yaw),
      -Math.cos(standingLook.current.yaw),
    ])
    const next = postureTarget(world, posture, s.position, s.feet, heading)
    target.current = next
    onPostureRef.current?.(next)
    ease.current = {
      from: currentLook(),
      to: {
        position: new Vector3(
          next.eye[0] / 1000,
          next.eye[1] / 1000,
          next.eye[2] / 1000
        ),
        yaw: -next.heading * DEG,
        pitch: next.pitch * DEG,
      },
      t: 0,
    }
    // `camera` is stable for the canvas's life; world/posture drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posture, world])

  const poseNow = (): WalkPose => {
    const look = new Vector3()
    camera.getWorldDirection(look)
    const settled = ease.current?.to ?? null
    const position = settled?.position ?? camera.position
    return {
      posture: postureRef.current,
      label: target.current?.label ?? "Standing",
      eye: [
        Math.round(position.x * 1000),
        Math.round(position.y * 1000),
        Math.round(position.z * 1000),
      ],
      heading: settled
        ? bearingOf([-Math.sin(settled.yaw), -Math.cos(settled.yaw)])
        : cameraHeading(look),
      pitch: settled
        ? settled.pitch / DEG
        : Math.asin(Math.max(-1, Math.min(1, look.y))) / DEG,
    }
  }

  useEffect(() => {
    if (!registerView) return
    registerView(() => {
      const s = state.current
      const look = new Vector3()
      camera.getWorldDirection(look)
      const eye: [number, number, number] =
        postureRef.current === "standing"
          ? // The eye without head-bob: photos shouldn't wobble.
            [s.position[0], s.feet + world.player.eyeHeight, s.position[1]]
          : (target.current?.eye ?? [
              camera.position.x * 1000,
              camera.position.y * 1000,
              camera.position.z * 1000,
            ])
      return {
        position: eye,
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
      pose: poseNow,
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
    // poseNow reads refs and the stable camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world])

  useFrame((_, delta) => {
    const e = euler.current
    e.setFromQuaternion(camera.quaternion, "YXZ")
    if (pendingHeading.current !== null) {
      // Bearing h (clockwise on the plan) is a yaw of −h about +y.
      e.set(e.x, -pendingHeading.current * DEG, 0, "YXZ")
      pendingHeading.current = null
    }
    const standing = postureRef.current === "standing"
    const easing = ease.current

    if (easing) {
      // Sitting down / lying down / standing up: glide, don't teleport.
      takeLook()
      easing.t = Math.min(EASE_SECONDS, easing.t + delta)
      const k = smoothstep(easing.t / EASE_SECONDS)
      camera.position.lerpVectors(easing.from.position, easing.to.position, k)
      e.set(
        easing.from.pitch + (easing.to.pitch - easing.from.pitch) * k,
        lerpAngle(easing.from.yaw, easing.to.yaw, k),
        0,
        "YXZ"
      )
      camera.quaternion.setFromEuler(e)
      if (easing.t >= EASE_SECONDS) ease.current = null
      return
    }

    const held = active && standing ? keys.current : NO_KEYS
    const turn = turnFromKeys(held, delta)
    if (turn !== 0) e.y -= turn * DEG
    const { dx, dy } = takeLook()
    if (active && (dx !== 0 || dy !== 0)) {
      const lying = postureRef.current === "lying"
      e.y -= dx * LOOK_SENSITIVITY
      e.x = Math.max(
        lying ? LYING_MIN_PITCH : -MAX_PITCH,
        Math.min(MAX_PITCH, e.x - dy * LOOK_SENSITIVITY)
      )
    }
    camera.quaternion.setFromEuler(e)
    camera.getWorldDirection(direction.current)

    if (!standing) {
      // Frozen in place: no physics, no head-bob.
      const eye = target.current?.eye
      if (eye) camera.position.set(eye[0] / 1000, eye[1] / 1000, eye[2] / 1000)
      return
    }

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
