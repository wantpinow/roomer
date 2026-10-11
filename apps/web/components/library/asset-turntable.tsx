"use client"

import dynamic from "next/dynamic"

import type { AssetSpec } from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

const Canvas = dynamic(
  () => import("./asset-turntable-canvas").then((m) => m.AssetTurntableCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center text-ui text-muted-foreground">
        Loading the model…
      </div>
    ),
  }
)

/** A framed, slowly turning clay model of an asset. */
export function AssetTurntable({
  asset,
  parts,
  className,
}: {
  asset: AssetSpec
  /** How many parts the model is built from, shown as a caption. */
  parts?: number
  className?: string
}) {
  return (
    <figure
      data-slot="asset-turntable"
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-[#ece8e1] shadow-hairline",
        className
      )}
    >
      <div className="aspect-[4/3] w-full">
        <Canvas asset={asset} />
      </div>
      <figcaption className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-popover/95 px-2.5 py-1 text-2xs text-ink-soft shadow-soft">
        <span className="size-1.5 rounded-full bg-clay-fill" />
        Clay model
        {parts !== undefined ? (
          <span className="font-mono text-muted-foreground">
            · {parts} {parts === 1 ? "part" : "parts"}
          </span>
        ) : null}
        <span className="text-muted-foreground">· drag to turn</span>
      </figcaption>
    </figure>
  )
}
