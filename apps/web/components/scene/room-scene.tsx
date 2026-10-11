"use client"

import { OrbitControls } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import { useEffect, useMemo } from "react"

import { sunSetup } from "@/lib/scene/lighting"
import {
  createSceneMaterials,
  type DepthRange,
  type PlacementState,
} from "@/lib/scene/materials"
import {
  buildRoomShell,
  cutWalls,
  shellBounds,
} from "@/lib/scene/room-geometry"
import { type SceneContent, showsCeiling } from "@/lib/scene/types"
import {
  boxCorners,
  type CameraSetup,
  roomViewSetup,
  type Vec3,
} from "@/lib/scene/views"

import { ClayEffects } from "./clay-effects"
import { ClayLighting } from "./clay-lighting"
import { PlacementMesh } from "./placement-mesh"
import { RoomShellMeshes } from "./room-shell-meshes"
import { SceneCamera } from "./scene-camera"

export interface RoomSceneProps {
  scene: SceneContent
  /** Selected placement ids (drawn in the accent colour, clay pass only). */
  selection?: readonly string[]
  /** A placement to highlight, e.g. the one under the pointer. */
  highlight?: string | null
  /** Click on an item → its id; click on empty space → null. */
  onSelect?: (placementId: string | null) => void
  /** Pointer enters an item → its id; leaves → null. */
  onHighlight?: (placementId: string | null) => void
  /** Enables pointer events and orbit/pan/zoom controls. */
  interactive?: boolean
  /** Cheaper post-processing for interactive use. */
  fast?: boolean
}

/** Depth range (metres) covering the shell from the camera's point of view. */
function depthRangeFor(
  camera: CameraSetup,
  corners: readonly Vec3[]
): DepthRange {
  const forward: Vec3 = [
    camera.target[0] - camera.position[0],
    camera.target[1] - camera.position[1],
    camera.target[2] - camera.position[2],
  ]
  const length = Math.hypot(...forward)
  const depths = corners.map(
    (c) =>
      ((c[0] - camera.position[0]) * forward[0] +
        (c[1] - camera.position[1]) * forward[1] +
        (c[2] - camera.position[2]) * forward[2]) /
      length
  )
  return {
    near: Math.max(0, Math.min(...depths)),
    far: Math.max(...depths),
  }
}

/**
 * A room — shell, items, lights and post-processing for one pass — drawn
 * inside an R3F `<Canvas>`. Shared by the app's viewer and the headless
 * /render page, so what the agent renders is what the user sees.
 */
export function RoomScene({
  scene,
  selection,
  highlight,
  onSelect,
  onHighlight,
  interactive = false,
  fast = false,
}: RoomSceneProps) {
  const { room, placements, assets, view, pass } = scene
  const aspect = useThree((state) => state.size.width / state.size.height)
  const shell = useMemo(() => buildRoomShell(room), [room])
  const setup = useMemo(
    () => roomViewSetup(view, shell, aspect),
    [view, shell, aspect]
  )
  const ceiling = showsCeiling(scene)
  const solids = useMemo(() => {
    const visible = ceiling
      ? shell.solids
      : shell.solids.filter((s) => !s.ceiling)
    return setup.cutWalls.length > 0
      ? cutWalls(visible, setup.cutWalls, setup.cutHeight)
      : visible
  }, [shell, ceiling, setup])
  const depthRange = useMemo(() => {
    const b = shellBounds(shell)
    return depthRangeFor(
      setup.camera,
      boxCorners(
        [b.minX / 1000, b.minY / 1000, b.minZ / 1000],
        [b.maxX / 1000, b.maxY / 1000, b.maxZ / 1000]
      )
    )
  }, [shell, setup])
  const materials = useMemo(
    () => createSceneMaterials(pass, depthRange),
    [pass, depthRange]
  )
  useEffect(() => () => materials.dispose(), [materials])
  const sun = useMemo(
    () => sunSetup(shell, { overhead: !ceiling }),
    [shell, ceiling]
  )
  const clay = pass === "clay"
  const selected = useMemo(() => new Set(selection ?? []), [selection])

  const stateOf = (id: string): PlacementState =>
    !clay
      ? "normal"
      : selected.has(id)
        ? "selected"
        : highlight === id
          ? "hovered"
          : "normal"

  return (
    <>
      <primitive attach="background" object={materials.background} />
      <SceneCamera setup={setup.camera} />
      {interactive ? (
        <OrbitControls
          makeDefault
          target={setup.camera.target}
          enableRotate={view.kind !== "top"}
          enableDamping
          dampingFactor={0.12}
        />
      ) : null}
      {clay ? <ClayLighting sun={sun} overhead={!ceiling} /> : null}
      <RoomShellMeshes solids={solids} materials={materials} shadows={clay} />
      <group name="items">
        {placements.map((placement, index) => {
          const asset = assets[placement.assetId]
          if (!asset) return null
          return (
            <PlacementMesh
              key={placement.id}
              placement={placement}
              asset={asset}
              index={index}
              materials={materials}
              state={stateOf(placement.id)}
              shadows={clay}
              {...(interactive && onSelect ? { onSelect } : {})}
              {...(interactive && onHighlight ? { onHover: onHighlight } : {})}
            />
          )
        })}
      </group>
      {clay ? <ClayEffects fast={fast} /> : null}
    </>
  )
}
