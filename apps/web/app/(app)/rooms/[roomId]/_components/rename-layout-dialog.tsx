"use client"

import { useState } from "react"

import { Button } from "@roomer/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@roomer/ui/components/dialog"
import { Input } from "@roomer/ui/components/input"
import { Label } from "@roomer/ui/components/label"

import type { LayoutSummary } from "@/components/layouts/layout-card"

/** Rename a layout; the agent refers to layouts by name, so keep it short. */
export function RenameLayoutDialog({
  layout,
  onOpenChange,
  onRename,
}: {
  layout: LayoutSummary | null
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => Promise<void>
}) {
  return (
    <Dialog open={layout !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {layout ? (
          // Keyed so the field starts from the layout's current name.
          <RenameForm key={layout.id} layout={layout} onRename={onRename} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({
  layout,
  onRename,
}: {
  layout: LayoutSummary
  onRename: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(layout.name)
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim()
  const valid = trimmed.length > 0 && trimmed.length <= 80

  return (
    <form
      className="contents"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!valid || trimmed === layout.name) return
        setSaving(true)
        await onRename(trimmed)
        setSaving(false)
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename layout</DialogTitle>
        <DialogDescription>
          The agent refers to layouts by name, so keep it short and descriptive.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="layout-name">Name</Label>
        <Input
          id="layout-name"
          value={name}
          maxLength={80}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          aria-invalid={!valid || undefined}
        />
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!valid || saving}>
          {saving ? "Saving…" : "Rename"}
        </Button>
      </DialogFooter>
    </form>
  )
}
