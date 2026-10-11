"use client"

import { useMutation } from "convex/react"
import { PlusIcon } from "lucide-react"
import { useState } from "react"

import { api } from "@roomer/backend/convex/_generated/api"
import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import type { LayoutStatus } from "@roomer/core/schema"
import { Button } from "@roomer/ui/components/button"
import { useToast } from "@roomer/ui/components/toast"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@roomer/ui/components/tooltip"

import { LayoutActionsMenu } from "@/components/layouts/layout-actions-menu"
import type { LayoutSummary } from "@/components/layouts/layout-card"
import { LayoutList } from "@/components/layouts/layout-list"
import { LAYOUT_STATUS_LABELS } from "@/components/layouts/layout-status-chip"
import { RailPanel } from "@/components/workspace/rail-panel"
import { describeError } from "@/lib/app-error"
import { asId } from "@/lib/workspace/view-models"

import { RenameLayoutDialog } from "./rename-layout-dialog"

/**
 * The layouts rail, live: pick a layout, start a new one, and rename,
 * duplicate (fork) or re-status any of them.
 */
export function LayoutsRail({
  roomId,
  layouts,
  selectedId,
  onSelect,
}: {
  roomId: Id<"rooms">
  layouts: readonly LayoutSummary[] | undefined
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  const { toast } = useToast()
  const create = useMutation(api.layouts.create)
  const update = useMutation(api.layouts.update)
  const [renaming, setRenaming] = useState<LayoutSummary | null>(null)

  const fail = (title: string) => (error: unknown) =>
    toast({ tone: "error", title, description: describeError(error) })

  const createLayout = async (name: string, fromLayoutId?: string) => {
    try {
      const { layoutId } = await create({
        roomId,
        name,
        ...(fromLayoutId
          ? { fromLayoutId: asId<"layouts">(fromLayoutId) }
          : {}),
      })
      onSelect(layoutId)
    } catch (error) {
      fail("Couldn't create the layout")(error)
    }
  }

  const setStatus = (layout: LayoutSummary, status: LayoutStatus) => {
    update({ layoutId: asId<"layouts">(layout.id), status })
      .then(() =>
        toast({
          title: `${layout.name} is now ${LAYOUT_STATUS_LABELS[status].toLowerCase()}`,
        })
      )
      .catch(fail("Couldn't change the status"))
  }

  return (
    <>
      <RailPanel
        title="Layouts"
        count={layouts?.length}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="New layout"
                onClick={() => void createLayout("Untitled layout")}
              >
                <PlusIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New empty layout</TooltipContent>
          </Tooltip>
        }
      >
        <LayoutList
          layouts={layouts}
          selectedId={selectedId}
          onSelect={onSelect}
          renderActions={(layout) => (
            <LayoutActionsMenu
              layoutName={layout.name}
              status={layout.status}
              onRename={() => setRenaming(layout)}
              onDuplicate={() =>
                void createLayout(`${layout.name} (copy)`, layout.id)
              }
              onSetStatus={(status) => setStatus(layout, status)}
            />
          )}
        />
      </RailPanel>
      <RenameLayoutDialog
        layout={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        onRename={async (name) => {
          if (!renaming) return
          try {
            await update({ layoutId: asId<"layouts">(renaming.id), name })
            setRenaming(null)
          } catch (error) {
            fail("Couldn't rename the layout")(error)
          }
        }}
      />
    </>
  )
}
