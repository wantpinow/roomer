"use client"

import type { AssetSpec, Placement } from "@roomer/core"
import { expandParts } from "@roomer/core/assets"
import { facingToRotationY } from "@roomer/core/geometry"
import type { ThreeEvent } from "@react-three/fiber"
import { useEffect, useMemo } from "react"

import type { PlacementState, SceneMaterials } from "@/lib/scene/materials"
import {
  partGeometry,
  partIsDoubleSided,
  partPose,
} from "@/lib/scene/part-geometry"
import { toMetres } from "@/lib/scene/types"

export interface PlacementPointerHandlers {
  onSelect?: (placementId: string) => void
  onHover?: (placementId: string | null) => void
}

/**
 * One placed item: a group at the placement's footprint centre (metres),
 * turned to its facing and mirrored on local x when asked, holding a mesh
 * per asset part.
 */
export function PlacementMesh({
  placement,
  asset,
  index,
  materials,
  state = "normal",
  shadows,
  onSelect,
  onHover,
}: {
  placement: Placement
  asset: AssetSpec
  /** Position in the layout's placement list (sets the id-pass colour). */
  index: number
  materials: SceneMaterials
  state?: PlacementState
  shadows: boolean
} & PlacementPointerHandlers) {
  const parts = useMemo(
    () =>
      expandParts(asset.geometry.parts).map((part) => ({
        part,
        geometry: partGeometry(part),
        pose: partPose(part),
      })),
    [asset]
  )
  useEffect(
    () => () => {
      for (const { geometry } of parts) geometry.dispose()
    },
    [parts]
  )
  const handlers = {
    ...(onSelect
      ? {
          onClick: (event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation()
            onSelect(placement.id)
          },
        }
      : {}),
    ...(onHover
      ? {
          onPointerOver: (event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation()
            onHover(placement.id)
          },
          onPointerOut: () => onHover(null),
        }
      : {}),
  }
  return (
    <group
      name={placement.id}
      userData={{ placementId: placement.id }}
      position={[
        toMetres(placement.x),
        toMetres(placement.elevation),
        toMetres(placement.z),
      ]}
      rotation-y={facingToRotationY(placement.facing)}
      scale-x={placement.mirrored ? -1 : 1}
      {...handlers}
    >
      {parts.map(({ part, geometry, pose }, i) => (
        <mesh
          key={i}
          name={part.name}
          geometry={geometry}
          position={pose.position}
          rotation={pose.rotation}
          material={materials.part({
            tone: part.tone,
            placementIndex: index,
            state,
            doubleSided: partIsDoubleSided(part),
          })}
          castShadow={shadows}
          receiveShadow={shadows}
        />
      ))}
    </group>
  )
}
