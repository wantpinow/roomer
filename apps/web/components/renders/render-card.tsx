"use client"

import { TriangleAlertIcon } from "lucide-react"

import type { RenderKind, RenderStatus } from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

import { ImageFrame } from "@/components/common/image-frame"
import { RelativeTime } from "@/components/common/relative-time"
import { formatDuration, modelLabel } from "@/lib/format/render"

/** A render record as the gallery shows it. */
export interface RenderSummary {
  id: string
  /** photoreal (default) or a bare clay / id pass. */
  kind?: RenderKind
  status: RenderStatus
  /** Gateway model id, e.g. "openai/gpt-image-2.5-sunburst". */
  model?: string
  /** The photoreal output (when done). */
  imageUrl?: string
  /** The clay and id passes it was painted from. */
  clayUrl?: string
  idUrl?: string
  cameraName?: string
  /** Epoch ms. */
  createdAt: number
  durationMs?: number
  error?: string
  layoutRevision?: number
}

/**
 * One render: the photoreal image (or a shimmering clay while pending, or
 * the error when it failed), with its clay/id passes as tiny swatches and
 * the camera, model and time beneath.
 */
export function RenderCard({
  render,
  onOpen,
  now,
  className,
}: {
  render: RenderSummary
  onOpen?: (id: string) => void
  now?: number
  className?: string
}) {
  const title = render.cameraName ?? "Render"
  const model = render.model ? modelLabel(render.model) : null
  const pass = render.kind && render.kind !== "photoreal" ? render.kind : null
  const openable = render.status === "done" && onOpen !== undefined

  return (
    <figure
      data-slot="render-card"
      data-status={render.status}
      className={cn("group/render flex flex-col gap-2.5", className)}
    >
      <button
        type="button"
        disabled={!openable}
        onClick={() => onOpen?.(render.id)}
        aria-label={openable ? `Open ${title} render` : undefined}
        className="relative block w-full overflow-hidden rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-card enabled:cursor-zoom-in"
      >
        {render.status === "failed" ? (
          <div
            style={{ aspectRatio: "3/2" }}
            className="flex flex-col items-center justify-center gap-2 rounded-md border border-error/15 bg-error-tint px-6 text-center"
          >
            <TriangleAlertIcon className="size-4 text-error" aria-hidden />
            <p className="text-xs font-medium text-error">Render failed</p>
            {render.error ? (
              <p className="line-clamp-2 text-2xs text-error/85">
                {render.error}
              </p>
            ) : null}
          </div>
        ) : render.status === "pending" ? (
          <div className="relative">
            <ImageFrame
              src={render.clayUrl}
              alt={`Clay pass for ${title}`}
              ratio="3/2"
              imageClassName="opacity-60! grayscale"
            />
            <div className="absolute inset-0 bg-shimmer motion-safe:animate-shimmer" />
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-popover px-2 py-0.5 text-2xs font-medium text-ink-soft shadow-soft">
              <span className="size-1.5 rounded-full bg-clay-fill motion-safe:animate-pulse" />
              Rendering…
            </span>
          </div>
        ) : (
          <ImageFrame
            src={render.imageUrl}
            alt={`Photoreal render from ${title}`}
            ratio="3/2"
            imageClassName="transition-transform duration-700 ease-out-soft group-hover/render:scale-[1.015]"
          />
        )}
      </button>
      <figcaption className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-ui font-medium text-foreground">
              {title}
            </span>
            <RelativeTime
              at={render.createdAt}
              now={now}
              className="ml-auto shrink-0 text-2xs text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-1.5 truncate text-2xs text-muted-foreground">
            {pass ? (
              <span className="rounded-xs bg-sunken px-1 font-mono tracking-wide uppercase">
                {pass} pass
              </span>
            ) : null}
            {model ? (
              <span className="truncate font-mono" title={render.model}>
                {model.name}
              </span>
            ) : null}
            {render.durationMs !== undefined ? (
              <>
                <span aria-hidden className="text-faint">
                  ·
                </span>
                <span className="tabular-nums">
                  {formatDuration(render.durationMs)}
                </span>
              </>
            ) : null}
            {render.layoutRevision !== undefined ? (
              <>
                <span aria-hidden className="text-faint">
                  ·
                </span>
                <span className="font-mono tabular-nums">
                  r{render.layoutRevision}
                </span>
              </>
            ) : null}
          </div>
        </div>
        {render.clayUrl || render.idUrl ? (
          <div className="flex shrink-0 -space-x-1.5 pt-0.5">
            {render.clayUrl ? (
              <PassSwatch src={render.clayUrl} label="Clay pass" />
            ) : null}
            {render.idUrl ? (
              <PassSwatch src={render.idUrl} label="ID pass" />
            ) : null}
          </div>
        ) : null}
      </figcaption>
    </figure>
  )
}

function PassSwatch({ src, label }: { src: string; label: string }) {
  return (
    <span title={label} className="block">
      <ImageFrame
        src={src}
        alt={label}
        ratio="1"
        className="w-6 rounded-full border-2 border-card shadow-hairline"
      />
    </span>
  )
}
