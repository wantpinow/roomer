"use client"

import type { ReactNode } from "react"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache"

import { env } from "@/env"

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL)

/**
 * The Convex client for the whole app. No auth provider in v1 (single local
 * user); when auth arrives it wraps here, like masterguest's
 * ConvexBetterAuthProvider.
 *
 * `ConvexQueryCacheProvider` backs the cached `useQuery` from
 * `convex-helpers/react/cache` — the only query hook the lint rules allow.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      <ConvexQueryCacheProvider>{children}</ConvexQueryCacheProvider>
    </ConvexProvider>
  )
}
