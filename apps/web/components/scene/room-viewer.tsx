"use client"

import { Html } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { cn } from "@roomer/ui/lib/utils"
import { useMemo, useState } from "react"

import { assetLocalBounds } from "@roomer/core/assets"
import { idPassLegend } from "@/lib/scene/id-pass"
import type { SceneContent } from "@/lib/scene/types"

import { passCanvasProps } from "./canvas-config"
import { RoomScene } from "./room-scene"

export interface RoomViewerProps {
  scene: SceneContent
  /**
   * Selected placement ids. Pass with `onSelectionChange` to control the
   * selection; omit both to let the viewer keep its own.
   */
  selection?: readonly string[]
  onSelectionChange?: (placementId: string | null) => void
  /** Orbit / pan / zoom, hover highlight and click-to-select. Default true. */
  interactive?: boolean
  className?: string
}

/**
 * The interactive 3D view for the app: the shared `RoomScene` in a
 * full-size canvas with orbit controls, hover labels and click-to-select.
 */
export function RoomViewer({
  scene,
  selection,
  onSelectionChange,
  interactive = true,
  className,
}: RoomViewerProps) {
  const [ownSelection, setOwnSelection] = useState<readonly string[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const selected = selection ?? ownSelection
  const select = (id: string | null) => {
    if (onSelectionChange) onSelectionChange(id)
    else setOwnSelection(id ? [id] : [])
  }
  const labels = useMemo(
    () =>
      new Map(
        idPassLegend(scene.placements, scene.assets).map((e) => [
          e.placementId,
          e.label,
        ])
      ),
    [scene.placements, scene.assets]
  )
  const hoveredPlacement = hovered
    ? scene.placements.find((p) => p.id === hovered)
    : undefined
  const hoveredAsset = hoveredPlacement
    ? scene.assets[hoveredPlacement.assetId]
    : undefined
  const labelHeight = hoveredAsset
    ? (hoveredPlacement!.elevation + assetLocalBounds(hoveredAsset).max[1]) /
        1000 +
      0.12
    : 0

  return (
    <div className={cn("relative h-full w-full", className)} data-room-viewer>
      <Canvas
        {...passCanvasProps(scene.pass)}
        dpr={[1, 2]}
        onPointerMissed={interactive ? () => select(null) : undefined}
      >
        <RoomScene
          scene={scene}
          selection={selected}
          highlight={hovered}
          onSelect={select}
          onHighlight={setHovered}
          interactive={interactive}
          fast
        />
        {interactive && hoveredPlacement ? (
          <Html
            position={[
              hoveredPlacement.x / 1000,
              labelHeight,
              hoveredPlacement.z / 1000,
            ]}
            center
            zIndexRange={[20, 0]}
            style={{ pointerEvents: "none" }}
          >
            <span className="rounded-sm border border-black/10 bg-white/90 px-2 py-0.5 text-xs whitespace-nowrap text-neutral-800 shadow-sm">
              {labels.get(hoveredPlacement.id) ?? hoveredPlacement.id}
            </span>
          </Html>
        ) : null}
      </Canvas>
    </div>
  )
}
