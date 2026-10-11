import type { RenderPass, Tone } from "@roomer/core"
import {
  Color,
  DoubleSide,
  FrontSide,
  LinearSRGBColorSpace,
  type Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  type Side,
} from "three"

import { idPassColor } from "./id-pass"
import {
  CLAY_BACKGROUND,
  CLAY_HOVERED,
  CLAY_SELECTED,
  CLAY_SHELL,
  CLAY_TONES,
  DEFAULT_TONE,
  ID_PASS_BACKGROUND,
  idPassShellColor,
} from "./palette"
import type { ShellRole } from "./room-geometry"

// One material per (pass, role / tone, state), created lazily and shared by
// every mesh that needs it. Everything here is three.js but not React, so it
// runs (and is tested) in node.
//
// The id and depth passes render with a linear output colour space (the
// canvas's `linear` flag) and set their colours as linear values, so the
// bytes written are exactly the palette's bytes — no sRGB round trip, no tone
// mapping, no dithering.

export type PlacementState = "normal" | "hovered" | "selected"

export interface DepthRange {
  /** Depth (metres) drawn white. */
  near: number
  /** Depth (metres) drawn black. */
  far: number
  /**
   * Measure straight-line distance from the camera instead of distance
   * along the view axis (fisheye sources, whose wide view would otherwise
   * read the edges of the room as close).
   */
  radial?: boolean
}

export interface SceneMaterials {
  readonly pass: RenderPass
  readonly background: Color
  shell(role: ShellRole): Material
  part(options: {
    tone: Tone | undefined
    placementIndex: number
    state?: PlacementState
    doubleSided?: boolean
  }): Material
  dispose(): void
}

/** A colour whose stored (working) value is exactly hex / 255. */
export function exactColor(hex: string): Color {
  return new Color().setStyle(hex, LinearSRGBColorSpace)
}

const DEPTH_VERTEX = /* glsl */ `
varying vec3 vView;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vView = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`

// Distance is computed per fragment: interpolating a per-vertex length
// across a long wall would bow it.
const DEPTH_FRAGMENT = /* glsl */ `
uniform float uNear;
uniform float uFar;
uniform float uRadial;
varying vec3 vView;
void main() {
  float depth = uRadial > 0.5 ? length(vView) : -vView.z;
  float d = clamp((depth - uNear) / max(uFar - uNear, 1e-6), 0.0, 1.0);
  gl_FragColor = vec4(vec3(1.0 - d), 1.0);
}
`

export function createDepthMaterial(
  range: DepthRange,
  side: Side
): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: DEPTH_VERTEX,
    fragmentShader: DEPTH_FRAGMENT,
    uniforms: {
      uNear: { value: range.near },
      uFar: { value: range.far },
      uRadial: { value: range.radial ? 1 : 0 },
    },
    side,
  })
}

function clayMaterial(
  hex: string,
  side: Side,
  state: PlacementState
): Material {
  const material = new MeshStandardMaterial({
    color: hex,
    roughness: 0.92,
    metalness: 0,
    side,
  })
  if (state === "selected") {
    material.color.lerp(new Color(CLAY_SELECTED), 0.55)
    material.emissive.set(CLAY_SELECTED)
    material.emissiveIntensity = 0.12
  } else if (state === "hovered") {
    material.color.lerp(new Color(CLAY_HOVERED), 0.3)
    material.emissive.set(CLAY_HOVERED)
    material.emissiveIntensity = 0.08
  }
  return material
}

export function createSceneMaterials(
  pass: RenderPass,
  depthRange: DepthRange = { near: 0, far: 10 }
): SceneMaterials {
  const cache = new Map<string, Material>()
  const cached = (key: string, make: () => Material): Material => {
    let material = cache.get(key)
    if (!material) {
      material = make()
      cache.set(key, material)
    }
    return material
  }

  const background =
    pass === "clay"
      ? new Color(CLAY_BACKGROUND)
      : pass === "id"
        ? exactColor(ID_PASS_BACKGROUND)
        : exactColor("#000000")

  const flat = (hex: string, side: Side) =>
    new MeshBasicMaterial({ color: exactColor(hex), toneMapped: false, side })

  return {
    pass,
    background,
    shell(role) {
      return cached(`shell:${role}`, () => {
        switch (pass) {
          case "id":
            return flat(idPassShellColor(role), FrontSide)
          case "depth":
            return createDepthMaterial(depthRange, FrontSide)
          case "clay":
            // Glass reads as bright daylight; it never shades or casts.
            return role === "glass"
              ? new MeshBasicMaterial({
                  color: CLAY_SHELL.glass,
                  toneMapped: false,
                })
              : clayMaterial(CLAY_SHELL[role], FrontSide, "normal")
        }
      })
    },
    part({ tone, placementIndex, state = "normal", doubleSided = false }) {
      const side = doubleSided ? DoubleSide : FrontSide
      switch (pass) {
        case "id": {
          const { hex } = idPassColor(placementIndex)
          return cached(`id:${hex}:${side}`, () => flat(hex, side))
        }
        case "depth":
          return cached(`depth:${side}`, () =>
            createDepthMaterial(depthRange, side)
          )
        case "clay": {
          const t = tone ?? DEFAULT_TONE
          return cached(`clay:${t}:${state}:${side}`, () =>
            clayMaterial(CLAY_TONES[t], side, state)
          )
        }
      }
    },
    dispose() {
      for (const material of cache.values()) material.dispose()
      cache.clear()
    },
  }
}
