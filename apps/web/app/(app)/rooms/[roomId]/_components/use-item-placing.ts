"use client"

import { useQuery } from "convex-helpers/react/cache"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { api } from "@roomer/backend/convex/_generated/api"
import type { Point, RoomGeometry } from "@roomer/core/geometry"
import { lint } from "@roomer/core/lint"
import type { AssetSpec, LayoutOp, Placement } from "@roomer/core/schema"

import type { PlanPlacing } from "@/components/plan/plan-view"
import {
  addOpFor,
  boundsOutline,
  boundsSpec,
  decidePlacement,
  describeDecision,
  ghostPlacement,
  ghostVerdict,
  placeOutline,
  resolveGhost,
  ROTATE_STEP_COARSE,
  ROTATE_STEP_FINE,
  turnFacing,
} from "@/lib/plan-edit/placing"
import { assetSpecOf } from "@/lib/workspace/view-models"

import type { PickerAsset } from "./asset-picker"

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  )
}

/**
 * Placing a new item on the plan. `start(asset)` arms it; the plan then
 * reports the pointer, and this works out the ghost — smart-snapped by
 * `decidePlacement`, resolved by core, linted together with the layout —
 * and on a click sends the `add` op through the layout editor. R turns the
 * ghost a quarter (Shift+R 15°), Esc cancels, Shift+click keeps placing.
 */
export function useItemPlacing({
  room,
  placements,
  assets,
  revision,
  apply,
  onPlaced,
  onCancelled,
}: {
  room: RoomGeometry | null
  placements: readonly Placement[]
  /** The layout's asset specs by id. */
  assets: Readonly<Record<string, AssetSpec>>
  revision: number | undefined
  apply: (
    ops: LayoutOp[],
    options: { expectedRevision?: number }
  ) => Promise<boolean>
  /** A placement was added (optimistically): its id, and whether to repeat. */
  onPlaced: (placementId: string, asset: PickerAsset) => void
  /** Esc: placing stopped without adding anything. */
  onCancelled: (viaDrag: boolean) => void
}) {
  const [asset, setAsset] = useState<PickerAsset | null>(null)
  const [viaDrag, setViaDrag] = useState(false)
  const [facing, setFacing] = useState(180)
  const [pointer, setPointer] = useState<{
    point: Point
    free: boolean
  } | null>(null)

  // The full model, for exact bounds and lint (the row's outline and size
  // stand in until it loads).
  const detail = useQuery(
    api.assets.get,
    asset ? { assetId: asset._id } : "skip"
  )
  const spec = useMemo<AssetSpec | null>(() => {
    if (!asset) return null
    return detail && detail._id === asset._id
      ? assetSpecOf(detail)
      : boundsSpec(asset)
  }, [asset, detail])

  const preview = useMemo(() => {
    if (!asset || !spec || !room || !pointer) return null
    const decision = decidePlacement({
      asset,
      pointer: pointer.point,
      facing,
      room,
      free: pointer.free,
    })
    const pose = resolveGhost(decision, spec, room, placements)
    if (!pose) return null
    const ghost = ghostPlacement(asset._id, asset.name, pose)
    const report = lint({
      room,
      placements: [...placements, ghost],
      assets: { ...assets, [asset._id]: spec },
    })
    const verdict = ghostVerdict(report)
    const outline = placeOutline(
      asset.footprint.length > 0 ? asset.footprint : boundsOutline(spec),
      pose
    )
    return { decision, pose, verdict, outline }
  }, [asset, spec, room, pointer, facing, placements, assets])

  const stop = useCallback(() => {
    setAsset(null)
    setPointer(null)
    setViaDrag(false)
  }, [])

  const start = useCallback(
    (next: PickerAsset, options: { viaDrag?: boolean } = {}) => {
      setAsset(next)
      setViaDrag(options.viaDrag ?? false)
      setFacing(180)
      setPointer(null)
    },
    []
  )

  const placedIds = useRef(new Set<string>())

  // The latest inputs, for the click handler.
  const latest = useRef({ asset, spec, facing, placements, revision })
  useEffect(() => {
    latest.current = { asset, spec, facing, placements, revision }
  })

  const place = useCallback(
    (point: Point, free: boolean, repeat: boolean) => {
      const {
        asset: current,
        spec: model,
        facing: turned,
        placements: now,
        revision: rev,
      } = latest.current
      if (!current || !model || !room) return
      // Decide afresh for the click's own point: the last pointer move may
      // not have been drawn yet.
      const decision = decidePlacement({
        asset: current,
        pointer: point,
        facing: turned,
        room,
        free,
      })
      if (!resolveGhost(decision, model, room, now)) return
      // Ids placed this session count as taken even before the layout
      // (optimistically) shows them, so Shift+click never reuses one.
      const op = addOpFor(current._id, current.name, decision.position, [
        ...now.map((p) => p.id),
        ...placedIds.current,
      ])
      placedIds.current.add(op.id)
      void apply([op], { expectedRevision: rev })
      onPlaced(op.id, current)
      if (!repeat) stop()
    },
    [apply, onPlaced, room, stop]
  )

  // R / Shift+R turn the ghost; Esc cancels. (The plan ignores keys while
  // placing; text fields keep theirs.)
  useEffect(() => {
    if (!asset) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      if (event.key === "r" || event.key === "R") {
        event.preventDefault()
        setFacing((f) =>
          turnFacing(f, event.shiftKey ? ROTATE_STEP_FINE : ROTATE_STEP_COARSE)
        )
      } else if (event.key === "Escape") {
        event.preventDefault()
        stop()
        onCancelled(viaDrag)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [asset, viaDrag, stop, onCancelled])

  const placing: PlanPlacing | null = asset
    ? {
        assetId: asset._id,
        label: asset.name,
        ghost: preview
          ? {
              outline: preview.outline,
              severity: preview.verdict.severity,
              label: asset.name,
              issue: preview.verdict.issue,
              hint: describeDecision(preview.decision, preview.pose),
              snap: preview.decision.snap,
            }
          : null,
        onMove: (point, { free }) => setPointer(point ? { point, free } : null),
        onPlace: ({ point, free, repeat }) => place(point, free, repeat),
      }
    : null

  return {
    placing,
    asset,
    viaDrag,
    start,
    stop,
  }
}
