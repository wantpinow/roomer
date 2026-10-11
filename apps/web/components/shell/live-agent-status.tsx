"use client"

import { useQuery } from "convex-helpers/react/cache"
import { useParams } from "next/navigation"

import { api } from "@roomer/backend/convex/_generated/api"

import { useSafeQuery } from "@/hooks/use-safe-query"
import { asId } from "@/lib/workspace/view-models"

import { AgentStatus } from "./agent-status"

/**
 * The top bar's agent pill, fed by `layouts.activity`: the room in the URL
 * if there is one, else the first room (v1 has one).
 */
export function LiveAgentStatus() {
  const params = useParams<{ roomId?: string }>()
  const rooms = useQuery(api.rooms.list, params.roomId ? "skip" : {})
  const roomId = params.roomId ?? rooms?.[0]?._id
  // Safe: a bad id in the URL must not take the top bar down with it.
  const activity = useSafeQuery(
    api.layouts.activity,
    roomId ? { roomId: asId<"rooms">(roomId) } : "skip"
  )
  return <AgentStatus lastActivityAt={activity.data?.latestAgentAt ?? null} />
}
