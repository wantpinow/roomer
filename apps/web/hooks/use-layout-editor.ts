"use client"

import { useMutation } from "convex/react"
import { useCallback } from "react"

import { api } from "@roomer/backend/convex/_generated/api"
import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import { toRoomGeometry } from "@roomer/core/geometry"
import type { LayoutOp, Placement } from "@roomer/core/schema"
import { useToast } from "@roomer/ui/components/toast"

import { appErrorOf, describeError } from "@/lib/app-error"
import { previewOps, restoreOp } from "@/lib/plan-edit/optimistic"
import { assetSpecs } from "@/lib/workspace/view-models"

/**
 * Layout edits from the UI, as the user. Every change goes through
 * `layouts.applyChanges` with an optimistic update that runs core's
 * `applyOps` on the cached layout, so the plan moves at once and snaps back
 * by itself if the server refuses. Revisions are bumped optimistically too,
 * so quick successive edits (key repeats) each carry the right
 * `expectedRevision` — Convex runs one client's mutations in order.
 */
export function useLayoutEditor({
  roomId,
  layoutId,
}: {
  roomId: Id<"rooms">
  layoutId: Id<"layouts"> | undefined
}) {
  const { toast } = useToast()
  const applyChanges = useMutation(
    api.layouts.applyChanges
  ).withOptimisticUpdate((store, args) => {
    const layout = store.getQuery(api.layouts.get, {
      layoutId: args.layoutId,
    })
    const room = store.getQuery(api.rooms.get, { roomId })
    if (!layout || !room) return
    const placements = previewOps({
      room: toRoomGeometry(room),
      placements: layout.placements,
      assets: assetSpecs(layout.assets),
      ops: args.ops,
    })
    if (!placements) return
    store.setQuery(
      api.layouts.get,
      { layoutId: args.layoutId },
      { ...layout, placements, revision: layout.revision + 1 }
    )
  })

  /** Apply ops; resolves true on success. Conflicts and refusals toast. */
  const apply = useCallback(
    async (
      ops: LayoutOp[],
      { expectedRevision }: { expectedRevision?: number } = {}
    ): Promise<boolean> => {
      if (!layoutId) return false
      try {
        await applyChanges({
          layoutId,
          ops,
          actor: "user",
          ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        })
        return true
      } catch (error) {
        const app = appErrorOf(error)
        if (app?.code === "CONFLICT") {
          toast({
            title: "The layout changed under you",
            description:
              "The agent edited it at the same time, so your change wasn't applied. You're looking at its latest version.",
          })
        } else {
          toast({
            tone: "error",
            title: "Couldn't change the layout",
            description: describeError(error),
          })
        }
        return false
      }
    },
    [applyChanges, layoutId, toast]
  )

  /** Remove an item, with an Undo that puts it back exactly. */
  const remove = useCallback(
    async (placement: Placement, name: string, revision?: number) => {
      const removed = await apply([{ op: "remove", id: placement.id }], {
        expectedRevision: revision,
      })
      if (!removed) return
      toast({
        title: `Removed ${name}`,
        action: {
          label: "Undo",
          onClick: () => {
            void apply([restoreOp(placement)])
          },
        },
      })
    },
    [apply, toast]
  )

  return { apply, remove }
}
