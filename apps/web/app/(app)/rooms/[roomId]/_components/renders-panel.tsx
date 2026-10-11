"use client"

import { SparklesIcon } from "lucide-react"
import { useState } from "react"

import {
  DEFAULT_PHOTOREAL_MODEL,
  PHOTOREAL_MODELS,
  type Camera,
  type PhotorealModel,
  type RenderQuality,
} from "@roomer/core/schema"
import { Button } from "@roomer/ui/components/button"
import { Label } from "@roomer/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roomer/ui/components/select"
import { useToast } from "@roomer/ui/components/toast"

import { RenderGallery } from "@/components/renders/render-gallery"
import type { RenderSummary } from "@/components/renders/render-card"
import { requestPhotoreal } from "@/lib/workspace/render-request"
import { modelLabel } from "@/lib/format/render"

const QUALITIES = [
  "low",
  "medium",
  "high",
] as const satisfies readonly RenderQuality[]

/**
 * The Renders tab: ask for a photoreal render of this layout from one of the
 * room's cameras, then watch it arrive (the record is created pending and
 * fills in live) in the gallery below.
 */
export function RendersPanel({
  layoutId,
  cameras,
  renders,
}: {
  layoutId: string | undefined
  cameras: readonly Camera[]
  renders: readonly RenderSummary[] | undefined
}) {
  const { toast } = useToast()
  const [cameraId, setCameraId] = useState<string | undefined>()
  const [model, setModel] = useState<PhotorealModel>(DEFAULT_PHOTOREAL_MODEL)
  const [quality, setQuality] = useState<RenderQuality>("low")
  const [sending, setSending] = useState(false)
  const camera = cameras.find((c) => c.id === cameraId) ?? cameras[0]

  const submit = async () => {
    if (!layoutId || !camera) return
    setSending(true)
    const result = await requestPhotoreal(layoutId, {
      camera: camera.id,
      model,
      quality,
    })
    setSending(false)
    if (result.ok) {
      toast({
        title: `Rendering from ${camera.name}`,
        description: "It appears below as soon as it starts.",
      })
    } else {
      toast({
        tone: "error",
        title: "Couldn't start the render",
        description: result.message,
      })
    }
  }

  return (
    <div className="flex flex-col">
      <form
        className="flex flex-col gap-3 border-b border-border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="render-camera">Camera</Label>
            <Select
              value={camera?.id}
              onValueChange={setCameraId}
              disabled={cameras.length === 0}
            >
              <SelectTrigger id="render-camera" className="w-full">
                <SelectValue placeholder="No cameras yet" />
              </SelectTrigger>
              <SelectContent position="popper">
                {cameras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="render-model">Model</Label>
            <Select
              value={model}
              onValueChange={(value) => {
                const found = PHOTOREAL_MODELS.find((m) => m === value)
                if (found) setModel(found)
              }}
            >
              <SelectTrigger id="render-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {PHOTOREAL_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {modelLabel(m).name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="render-quality">Quality</Label>
            <Select
              value={quality}
              onValueChange={(value) => {
                const found = QUALITIES.find((q) => q === value)
                if (found) setQuality(found)
              }}
            >
              <SelectTrigger id="render-quality" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {QUALITIES.map((q) => (
                  <SelectItem key={q} value={q} className="capitalize">
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          type="submit"
          variant="clay"
          disabled={!layoutId || !camera || sending}
        >
          <SparklesIcon data-icon="inline-start" />
          {sending ? "Starting…" : "Render photoreal"}
        </Button>
        <p className="text-2xs leading-relaxed text-muted-foreground">
          Paints the clay view with the products&apos; photos. Low quality is
          quick and cheap; renders take 30–90 seconds.
        </p>
      </form>
      <RenderGallery renders={renders} />
    </div>
  )
}
