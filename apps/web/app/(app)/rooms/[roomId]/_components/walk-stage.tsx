"use client"

import { api } from "@roomer/backend/convex/_generated/api"
import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import type { Camera } from "@roomer/core/schema"
import { useMutation } from "convex/react"
import { useQuery } from "convex-helpers/react/cache"
import dynamic from "next/dynamic"
import { useCallback, useMemo, useState } from "react"

import { describeError } from "@/lib/app-error"
import type { SceneContent } from "@/lib/scene/types"
import {
  MAX_ROOM_CAMERAS,
  photoSize,
  type WalkActionResult,
  type WalkPhoto,
} from "@/lib/walk/photo"
import { requestPhotoreal } from "@/lib/workspace/render-request"

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
 * there's no message when you bump into something. The shutter (Enter)
 * renders the current view photoreal, like taking a photo: the render is
 * started through the app's render route and followed in Convex, so it
 * also lands in the Renders tab. Shift+Enter saves the view as one of the
 * room's cameras.
 */
export function WalkStage({
  scene,
  onExit,
  roomId,
  layoutId,
  cameraCount,
}: {
  scene: Pick<SceneContent, "room" | "placements" | "assets">
  onExit: () => void
  roomId: Id<"rooms">
  /** The layout photos are rendered from (none while loading). */
  layoutId: Id<"layouts"> | undefined
  /** How many cameras the room has saved (rooms hold at most 50). */
  cameraCount: number
}) {
  const [photoIds, setPhotoIds] = useState<readonly string[]>([])
  // The same query (and args) the Renders tab watches: one subscription.
  const renders = useQuery(
    api.renders.listByLayout,
    layoutId && photoIds.length > 0 ? { layoutId } : "skip"
  )
  const photos = useMemo(
    (): WalkPhoto[] =>
      photoIds.map((id) => {
        const render = renders?.find((r) => r._id === id)
        return {
          id,
          status: render?.status ?? "pending",
          url: render?.outputUrl ?? null,
          ...(render?.error ? { error: render.error } : {}),
        }
      }),
    [photoIds, renders]
  )
  const upsertCamera = useMutation(api.rooms.upsertCamera)

  const onPhoto = useCallback(
    async (camera: Camera, aspect: number): Promise<WalkActionResult> => {
      if (!layoutId) {
        return { ok: false, message: "Open a layout to take photos of it." }
      }
      const result = await requestPhotoreal(layoutId, {
        camera: {
          name: camera.name,
          position: camera.position,
          target: camera.target,
          fov: camera.fov,
          projection: "rectilinear",
        },
        quality: "medium",
        size: photoSize(aspect),
      })
      if (!result.ok) return result
      setPhotoIds((ids) => [result.renderId, ...ids])
      return { ok: true }
    },
    [layoutId]
  )

  const onSaveView = useCallback(
    async (camera: Camera): Promise<WalkActionResult> => {
      if (cameraCount >= MAX_ROOM_CAMERAS) {
        return {
          ok: false,
          message: `This room already has ${MAX_ROOM_CAMERAS} saved cameras — remove one to save another.`,
        }
      }
      try {
        await upsertCamera({ roomId, camera })
        return {
          ok: true,
          message: `Saved “${camera.name}” to the room's cameras`,
        }
      } catch (error) {
        return { ok: false, message: describeError(error) }
      }
    },
    [cameraCount, roomId, upsertCamera]
  )

  return (
    <WalkViewer
      scene={scene}
      onExit={onExit}
      onPhoto={onPhoto}
      photos={photos}
      onSaveView={onSaveView}
    />
  )
}
