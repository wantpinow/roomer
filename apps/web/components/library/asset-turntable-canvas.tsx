"use client"

import { OrbitControls } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"

import type { AssetSpec } from "@roomer/core/schema"

import { AssetPreviewScene } from "@/components/scene/asset-preview-scene"
import { passCanvasProps } from "@/components/scene/canvas-config"

/**
 * The asset's clay model on the preview backdrop, turning slowly; drag to
 * turn it yourself. Load through `AssetTurntable` (browser-only).
 */
export function AssetTurntableCanvas({ asset }: { asset: AssetSpec }) {
  const middle = asset.dims.h / 2000
  return (
    <Canvas {...passCanvasProps("clay")} dpr={[1, 2]}>
      <AssetPreviewScene asset={asset} view="iso" />
      <OrbitControls
        makeDefault
        autoRotate
        autoRotateSpeed={0.9}
        enablePan={false}
        enableZoom={false}
        target={[0, middle, 0]}
      />
    </Canvas>
  )
}
