"use client"

import dynamic from "next/dynamic"

import type { SceneContent } from "@/lib/scene/types"

const WalkViewer = dynamic(
  () => import("@/components/scene/walk-viewer").then((m) => m.WalkViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center text-ui text-muted-foreground">
        Loading the walk…
      </div>
    ),
  }
)

/**
 * Walk mode: the first-person viewer. Collisions are felt, not announced —
 * there's no message when you bump into something.
 */
export function WalkStage({
  scene,
  onExit,
}: {
  scene: Pick<SceneContent, "room" | "placements" | "assets">
  onExit: () => void
}) {
  return <WalkViewer scene={scene} onExit={onExit} />
}
