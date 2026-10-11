"use client"

import { useQuery } from "convex-helpers/react/cache"

import { api } from "@roomer/backend/convex/_generated/api"
import { Badge } from "@roomer/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@roomer/ui/components/card"

/**
 * Proves the stack is wired: Next → Convex client → local deployment →
 * schema. Replaced by the rooms list in the UI milestone.
 */
export function HomeContent() {
  const ping = useQuery(api.health.ping, {})

  return (
    <main
      data-page-root
      className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 p-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>Roomer</CardTitle>
          <CardDescription>Room layouts, checked for mistakes.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Convex</span>
          {ping === undefined ? (
            <Badge variant="outline" data-testid="ping-status">
              connecting…
            </Badge>
          ) : (
            <Badge data-testid="ping-status">{ping.message}</Badge>
          )}
          {ping?.latestNote ? (
            <span data-testid="ping-note" className="text-muted-foreground">
              {ping.latestNote}
            </span>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
