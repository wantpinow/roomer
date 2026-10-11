"use client"

import type { AssetSpec, Placement } from "@roomer/core"
import { assetLocalBounds } from "@roomer/core/assets"
import { useThree } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import { Color, Object3D } from "three"

import { createSceneMaterials } from "@/lib/scene/materials"
import { PREVIEW_BACKGROUND } from "@/lib/scene/palette"
import type { AssetPreviewView } from "@/lib/scene/types"
import { assetViewSetup } from "@/lib/scene/views"

import { ClayEffects } from "./clay-effects"
import { PlacementMesh } from "./placement-mesh"
import { SceneCamera } from "./scene-camera"

const ORIGIN: Placement = {
  id: "preview",
  assetId: "preview",
  x: 0,
  z: 0,
  facing: 180,
  elevation: 0,
}

/**
 * An asset on a neutral studio backdrop, for the agent to compare against
 * product photos: orthographic front / side / top elevations fitted to the
 * asset's bounds, or a perspective 3/4 view. Soft key + fill light, a shadow
 * on an invisible ground, clay AO.
 */
export function AssetPreviewScene({
  asset,
  view,
}: {
  asset: AssetSpec
  view: AssetPreviewView
}) {
  const aspect = useThree((state) => state.size.width / state.size.height)
  const bounds = useMemo(() => assetLocalBounds(asset), [asset])
  const setup = useMemo(
    () => assetViewSetup(view, bounds, aspect),
    [view, bounds, aspect]
  )
  const materials = useMemo(() => createSceneMaterials("clay"), [])
  useEffect(() => () => materials.dispose(), [materials])
  const background = useMemo(() => new Color(PREVIEW_BACKGROUND), [])
  const keyTarget = useMemo(() => new Object3D(), [])
  const size =
    Math.max(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2]
    ) / 1000
  const centre: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2000,
    (bounds.min[1] + bounds.max[1]) / 2000,
    (bounds.min[2] + bounds.max[2]) / 2000,
  ]
  const reach = size * 3 + 1
  const shadow = size + 0.5
  return (
    <>
      <primitive attach="background" object={background} />
      <SceneCamera setup={setup} />
      <hemisphereLight args={["#f6f3ee", "#bcb2a6", 1.3]} />
      <primitive object={keyTarget} position={centre} />
      <directionalLight
        color="#fff6ea"
        intensity={2.2}
        position={[
          centre[0] + reach * 0.5,
          centre[1] + reach,
          centre[2] + reach * 0.7,
        ]}
        target={keyTarget}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.01}
        shadow-radius={6}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-shadow, shadow, shadow, -shadow, 0.1, reach * 3]}
        />
      </directionalLight>
      <directionalLight
        color="#eef1f6"
        intensity={0.6}
        position={[
          centre[0] - reach,
          centre[1] + reach * 0.4,
          centre[2] + reach * 0.3,
        ]}
        target={keyTarget}
      />
      {/* Invisible ground that only shows the shadow (and AO contact). */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.0005} receiveShadow>
        <planeGeometry args={[size * 20 + 10, size * 20 + 10]} />
        <shadowMaterial opacity={0.24} />
      </mesh>
      <PlacementMesh
        placement={ORIGIN}
        asset={asset}
        index={0}
        materials={materials}
        shadows
      />
      <ClayEffects />
    </>
  )
}
