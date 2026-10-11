"use client"

import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing"
import { ToneMappingMode } from "postprocessing"
import { HalfFloatType } from "three"

export const CLAY_AO = {
  /** World-space radius in metres (scene units are metres). */
  aoRadius: 0.8,
  distanceFalloff: 1,
  intensity: 3.2,
} as const

/**
 * The "Blender clay" finish: N8AO ambient occlusion for soft contact
 * shading, then Khronos PBR Neutral tone mapping (keeps the warm whites white). `fast` trades AO quality for frame rate
 * in the interactive viewer.
 */
export function ClayEffects({
  fast = false,
  multisampling,
}: {
  fast?: boolean
  /** Override the composer's MSAA samples (default 8, 0 when fast). */
  multisampling?: number
}) {
  return (
    <EffectComposer
      multisampling={multisampling ?? (fast ? 0 : 8)}
      frameBufferType={HalfFloatType}
    >
      <N8AO
        {...CLAY_AO}
        quality={fast ? "medium" : "high"}
        halfRes={fast}
        color="#000000"
      />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  )
}
