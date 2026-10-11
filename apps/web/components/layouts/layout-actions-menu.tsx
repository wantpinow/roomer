"use client"

import { CopyIcon, EllipsisIcon, PencilLineIcon } from "lucide-react"

import { zLayoutStatus, type LayoutStatus } from "@roomer/core/schema"
import { Button } from "@roomer/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@roomer/ui/components/dropdown-menu"

import { LAYOUT_STATUS_LABELS } from "./layout-status-chip"

/**
 * The ⋯ menu on a layout card. Each action shows only when its callback is
 * given, so read-only contexts simply omit them.
 */
export function LayoutActionsMenu({
  layoutName,
  status,
  onRename,
  onDuplicate,
  onSetStatus,
}: {
  layoutName: string
  status: LayoutStatus
  onRename?: () => void
  onDuplicate?: () => void
  onSetStatus?: (status: LayoutStatus) => void
}) {
  if (!onRename && !onDuplicate && !onSetStatus) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${layoutName}`}
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {onRename ? (
          <DropdownMenuItem onSelect={onRename}>
            <PencilLineIcon />
            Rename
          </DropdownMenuItem>
        ) : null}
        {onDuplicate ? (
          <DropdownMenuItem onSelect={onDuplicate}>
            <CopyIcon />
            Duplicate
          </DropdownMenuItem>
        ) : null}
        {onSetStatus ? (
          <>
            {onRename || onDuplicate ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={status}
              onValueChange={(next) => {
                const parsed = zLayoutStatus.safeParse(next)
                if (parsed.success) onSetStatus(parsed.data)
              }}
            >
              {zLayoutStatus.options.map((option) => (
                <DropdownMenuRadioItem key={option} value={option}>
                  {LAYOUT_STATUS_LABELS[option]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
