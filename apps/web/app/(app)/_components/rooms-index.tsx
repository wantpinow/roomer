"use client"

import { useQuery } from "convex-helpers/react/cache"
import { RulerIcon } from "lucide-react"

import { api } from "@roomer/backend/convex/_generated/api"
import { EmptyState } from "@roomer/ui/components/empty-state"
import { Skeleton } from "@roomer/ui/components/skeleton"

import { RoomCard } from "./room-card"

const MCP_COMMAND =
  "claude mcp add --transport http roomer http://localhost:3000/api/mcp/mcp"

/**
 * The home page: every room as a drawing-and-figures card. With one room
 * (the usual case) the card spans the page like a title sheet.
 */
export function RoomsIndex() {
  const rooms = useQuery(api.rooms.list, {})

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-12 px-8 pt-14 pb-20 motion-safe:animate-rise">
      <header className="flex flex-col gap-3">
        <span className="eyebrow">Your rooms</span>
        <h1 className="font-display text-[2.75rem] leading-[1.04] font-normal tracking-[-0.025em] text-foreground">
          Rooms<span className="text-clay-fill">.</span>
        </h1>
        <p className="max-w-[58ch] text-[0.9375rem] leading-relaxed text-ink-soft">
          Each room is measured once — walls, doors, windows. Layouts are the
          arrangements you and the agent try inside it, every one checked for
          mistakes as it changes.
        </p>
      </header>

      {rooms === undefined ? (
        <RoomsSkeleton />
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-hairline">
          <EmptyState
            icon={<RulerIcon />}
            title="No rooms yet"
            description="Rooms are measured by the agent. Connect Claude Code, then dictate your walls, doors and windows."
            action={
              <code className="block rounded-md border border-border bg-sunken px-3 py-2 font-mono text-2xs text-ink-soft select-all">
                {MCP_COMMAND}
              </code>
            }
          />
        </div>
      ) : (
        <ul
          className={
            rooms.length === 1
              ? "flex flex-col"
              : "grid gap-6 min-[1100px]:grid-cols-2"
          }
        >
          {rooms.map((room) => (
            <li key={room._id}>
              <RoomCard room={room} wide={rooms.length === 1} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RoomsSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Loading rooms"
      className="grid gap-8 rounded-xl border border-border bg-card p-8 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
    >
      <Skeleton className="aspect-[4/5] w-full rounded-lg" />
      <div className="flex flex-col gap-4 pt-2">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-6 h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}
