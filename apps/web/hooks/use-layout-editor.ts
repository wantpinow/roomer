"use client"

import { useMutation } from "convex/react"
import { useCallback } from "react"

import { api } from "@roomer/backend/convex/_generated/api"
import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import { toRoomGeometry } from "@roomer/core/geometry"
import type { LayoutOp, Placement } from "@roomer/core/schema"
import { useToast } from "@roomer/ui/components/toast"

import { appErrorOf, describeError } from "@/lib/app-error"
import { removeOps, restoreOps } from "@/lib/plan-edit/group"
import { previewOps } from "@/lib/plan-edit/optimistic"
import { asId, assetSpecOf, assetSpecs } from "@/lib/workspace/view-models"

/**
 * Layout edits from the UI, as the user. Every change goes through
 * `layouts.applyChanges` with an optimistic update that runs core's
 * `applyOps` on the cached layout (with the models of newly added items from
 * the cached asset queries), so the plan changes at once and snaps back by
 * itself if the server refuses. Revisions are bumped optimistically too,
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
    // Items new to the layout: take their models from the cached asset
    // queries (the picker loaded them), so adds preview too.
    const assets = { ...layout.assets }
    for (const op of args.ops) {
      if (op.op !== "add" || assets[op.asset]) continue
      const row = store.getQuery(api.assets.get, {
        assetId: asId<"assets">(op.asset),
      })
      if (!row) continue
      assets[row._id] = {
        ...assetSpecOf(row),
        _id: row._id,
        key: row.key,
        source: row.source,
        primaryImageUrl: row.primaryImageUrl,
      }
    }
    const placements = previewOps({
      room: toRoomGeometry(room),
      placements: layout.placements,
      assets: assetSpecs(assets),
      ops: args.ops,
    })
    if (!placements) return
    store.setQuery(
      api.layouts.get,
      { layoutId: args.layoutId },
      { ...layout, assets, placements, revision: layout.revision + 1 }
    )
  })

  /** Tell the user the agent changed the layout under their edit. */
  const conflict = useCallback(() => {
    toast({
      title: "The layout changed under you",
      description:
        "The agent edited it at the same time, so your change wasn't applied. You're looking at its latest version.",
    })
  }, [toast])

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
          conflict()
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
    [applyChanges, conflict, layoutId, toast]
  )

  /** Remove items in one batch, with an Undo that puts them all back. */
  const removeMany = useCallback(
    async (placements: Placement[], name: string, revision?: number) => {
      if (placements.length === 0) return
      const removed = await apply(removeOps(placements.map((p) => p.id)), {
        expectedRevision: revision,
      })
      if (!removed) return
      toast({
        title: `Removed ${name}`,
        action: {
          label: "Undo",
          onClick: () => {
            void apply(restoreOps(placements))
          },
        },
      })
    },
    [apply, toast]
  )

  /** Remove one item (see `removeMany`). */
  const remove = useCallback(
    (placement: Placement, name: string, revision?: number) =>
      removeMany([placement], name, revision),
    [removeMany]
  )

  return { apply, remove, removeMany, conflict }
}
