"use client"

import { useMemo } from "react"
import { Object3D } from "three"

import type { SunSetup } from "@/lib/scene/lighting"

// three.js lights are physical: ambient/hemisphere irradiance is divided by
// π in the Lambert BRDF, so ~π is "full" brightness.
export const CLAY_LIGHT = {
  sun: { color: "#fff4e6", intensity: 3.4, mapSize: 4096, radius: 4 },
  sky: { color: "#f7f5f1", ground: "#d9d0c5", intensity: 2.5 },
  ambient: { color: "#ffffff", intensity: 0.35 },
  fill: { color: "#eef2f8", intensity: 0.5 },
  /**
   * Without a ceiling the sun reaches every surface, so the whole rig is
   * dimmed to keep the floor from blowing out.
   */
  overheadScale: { sun: 0.55, sky: 0.62 },
} as const

/**
 * Soft daylight for the clay pass: a sky/ground hemisphere for the ambient
 * wash, a warm "sun" through the window casting soft shadows, and a weak
 * cool fill from the opposite side so nothing goes black.
 */
export function ClayLighting({
  sun,
  overhead = false,
}: {
  sun: SunSetup
  /** The ceiling is hidden (top and orbit views). */
  overhead?: boolean
}) {
  const sunIntensity =
    CLAY_LIGHT.sun.intensity * (overhead ? CLAY_LIGHT.overheadScale.sun : 1)
  const skyIntensity =
    CLAY_LIGHT.sky.intensity * (overhead ? CLAY_LIGHT.overheadScale.sky : 1)
  const target = useMemo(() => new Object3D(), [])
  const fillTarget = useMemo(() => new Object3D(), [])
  const h = sun.shadowHalfSize
  const fillPosition: [number, number, number] = [
    sun.target[0] + sun.direction[0] * 10,
    sun.target[1] + 6,
    sun.target[2] + sun.direction[2] * 10,
  ]
  return (
    <>
      <hemisphereLight
        args={[CLAY_LIGHT.sky.color, CLAY_LIGHT.sky.ground, skyIntensity]}
      />
      <ambientLight
        color={CLAY_LIGHT.ambient.color}
        intensity={CLAY_LIGHT.ambient.intensity}
      />
      <primitive object={target} position={sun.target} />
      <directionalLight
        color={CLAY_LIGHT.sun.color}
        intensity={sunIntensity}
        position={sun.position}
        target={target}
        castShadow
        shadow-mapSize={[CLAY_LIGHT.sun.mapSize, CLAY_LIGHT.sun.mapSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.015}
        shadow-radius={CLAY_LIGHT.sun.radius}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-h, h, h, -h, sun.shadowNear, sun.shadowFar]}
        />
      </directionalLight>
      <primitive object={fillTarget} position={sun.target} />
      <directionalLight
        color={CLAY_LIGHT.fill.color}
        intensity={CLAY_LIGHT.fill.intensity}
        position={fillPosition}
        target={fillTarget}
      />
    </>
  )
}
