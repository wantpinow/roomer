"use client"

import { ArrowLeftIcon, PackageSearchIcon, RefreshCwIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { api } from "@roomer/backend/convex/_generated/api"
import { Button } from "@roomer/ui/components/button"
import { EmptyState } from "@roomer/ui/components/empty-state"
import { Skeleton } from "@roomer/ui/components/skeleton"
import { useToast } from "@roomer/ui/components/toast"

import { ImageFrame } from "@/components/common/image-frame"
import { RelativeTime } from "@/components/common/relative-time"
import { AssetDetail } from "@/components/library/asset-detail"
import { AssetTurntable } from "@/components/library/asset-turntable"
import { useSafeQuery } from "@/hooks/use-safe-query"
import { requestAssetPreviews } from "@/lib/workspace/render-request"
import { asId, assetSpecOf, toAssetSummary } from "@/lib/workspace/view-models"

const PREVIEW_ORDER = ["front", "side", "top", "iso"] as const

/**
 * /library/[assetId]: the clay model turning beside the product photos and
 * its spec sheet, the agent's preview renders, and a way to regenerate them.
 */
export function AssetPage({ assetId }: { assetId: string }) {
  const { toast } = useToast()
  const query = useSafeQuery(api.assets.get, {
    assetId: asId<"assets">(assetId),
  })
  const [regenerating, setRegenerating] = useState(false)

  if (query.status === "error" || (query.status === "ready" && !query.data)) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <EmptyState
          icon={<PackageSearchIcon />}
          title="There's no such piece"
          description="It may have been removed from the library, or the link is wrong."
          action={<BackLink />}
        />
      </div>
    )
  }

  const asset = query.data ?? undefined
  const summary = asset
    ? {
        ...toAssetSummary(asset),
        referenceImages: asset.imageUrls.flatMap((image) =>
          image.url ? [image.url] : []
        ),
      }
    : undefined
  const previews = asset
    ? PREVIEW_ORDER.map((view) => ({
        view,
        url: asset.previewUrls.find((p) => p.view === view)?.url ?? undefined,
      }))
    : []

  const regenerate = async () => {
    setRegenerating(true)
    const result = await requestAssetPreviews(assetId)
    setRegenerating(false)
    toast(
      result.ok
        ? {
            title: "Rendering new previews",
            description: "They replace the old ones in a few seconds.",
          }
        : {
            tone: "error",
            title: "Couldn't regenerate the previews",
            description: result.message,
          }
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-8 pt-10 pb-20 motion-safe:animate-rise">
      <BackLink />
      <div className="grid items-start gap-10 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-8">
          {asset ? (
            <AssetTurntable
              asset={assetSpecOf(asset)}
              parts={asset.geometry.parts.length}
            />
          ) : (
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          )}

          <section
            aria-labelledby="previews-title"
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <h2 id="previews-title" className="eyebrow">
                  Previews
                </h2>
                <p className="text-xs text-muted-foreground">
                  What the agent compares against the product photos.
                  {asset ? (
                    <>
                      {" "}
                      Updated <RelativeTime at={asset.updatedAt} />.
                    </>
                  ) : null}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void regenerate()}
                disabled={!asset || regenerating}
              >
                <RefreshCwIcon
                  data-icon="inline-start"
                  className={regenerating ? "animate-spin" : undefined}
                />
                {regenerating ? "Starting…" : "Regenerate previews"}
              </Button>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(asset
                ? previews
                : PREVIEW_ORDER.map((view) => ({ view, url: undefined }))
              ).map((preview) => (
                <li key={preview.view} className="flex flex-col gap-1.5">
                  <ImageFrame
                    src={preview.url}
                    alt={`${preview.view} preview`}
                    ratio="1"
                    className="rounded-md border border-border"
                  />
                  <span className="eyebrow text-[10px]">{preview.view}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="rounded-xl border border-border bg-card p-6 shadow-hairline min-[1100px]:sticky min-[1100px]:top-6">
          <AssetDetail asset={summary} />
        </aside>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 self-start">
      <Link href="/library">
        <ArrowLeftIcon data-icon="inline-start" />
        Library
      </Link>
    </Button>
  )
}
