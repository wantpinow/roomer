import type { Metadata } from "next"
import { fetchQuery } from "convex/nextjs"
import { Suspense } from "react"

import { api } from "@roomer/backend/convex/_generated/api"

import { asId } from "@/lib/workspace/view-models"

import { RoomWorkspace } from "./_components/room-workspace"

type Params = Promise<{ roomId: string }>

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { roomId } = await params
  try {
    const room = await fetchQuery(api.rooms.get, {
      roomId: asId<"rooms">(roomId),
    })
    return { title: room?.name ?? "Room" }
  } catch {
    // A malformed id or an unreachable backend: the page explains itself.
    return { title: "Room" }
  }
}

export default async function RoomPage({ params }: { params: Params }) {
  const { roomId } = await params
  return (
    <Suspense>
      <RoomWorkspace roomId={roomId} />
    </Suspense>
  )
}
