"use client"

import dynamic from "next/dynamic"
import { useRef } from "react"

import { Toaster, useToast } from "@roomer/ui/components/toast"

import type { SceneContent } from "@/lib/scene/types"
import type { WalkBump } from "@/lib/walk/physics"
import { shouldAnnounceBump } from "@/lib/workspace/bumps"

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
 * Walk mode: the first-person viewer, with bumps announced as small toasts
 * inside the stage (not the page).
 */
export function WalkStage({
  scene,
  onExit,
}: {
  scene: Pick<SceneContent, "room" | "placements" | "assets">
  onExit: () => void
}) {
  return (
    <Toaster inline position="top-left" className="w-72">
      <WalkWithToasts scene={scene} onExit={onExit} />
    </Toaster>
  )
}

function WalkWithToasts({
  scene,
  onExit,
}: {
  scene: Pick<SceneContent, "room" | "placements" | "assets">
  onExit: () => void
}) {
  const { toast } = useToast()
  const last = useRef<WalkBump | null>(null)
  return (
    <WalkViewer
      scene={scene}
      onExit={onExit}
      onBump={(bump) => {
        if (!shouldAnnounceBump(last.current, bump)) return
        last.current = bump
        toast({ title: `Bumped into ${bump.label}`, duration: 1800 })
      }}
    />
  )
}
