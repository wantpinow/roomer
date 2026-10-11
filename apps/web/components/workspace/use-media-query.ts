"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Live `matchMedia` result. During SSR and hydration it reports
 * `serverDefault`, then settles to the real value — so markup never
 * mismatches.
 */
export function useMediaQuery(query: string, serverDefault = true): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", onChange)
      return () => media.removeEventListener("change", onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverDefault
  )
}
