import type { Metadata } from "next"
import { fetchQuery } from "convex/nextjs"

import { api } from "@roomer/backend/convex/_generated/api"

import { asId } from "@/lib/workspace/view-models"

import { AssetPage } from "./_components/asset-page"

type Params = Promise<{ assetId: string }>

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { assetId } = await params
  try {
    const asset = await fetchQuery(api.assets.get, {
      assetId: asId<"assets">(assetId),
    })
    return { title: asset?.name ?? "Asset" }
  } catch {
    return { title: "Asset" }
  }
}

export default async function AssetRoute({ params }: { params: Params }) {
  const { assetId } = await params
  return <AssetPage assetId={assetId} />
}
