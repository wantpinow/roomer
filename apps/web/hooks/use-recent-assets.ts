"use client"

import { useCallback, useState } from "react"

const KEY = "roomer-recent-assets"
const MAX = 6

function read(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string").slice(0, MAX)
      : []
  } catch {
    return []
  }
}

/**
 * Assets placed recently from this browser, newest first — a per-viewer
 * convenience for the add-item picker (localStorage; empty when blocked).
 * Only use in components that render after mount.
 */
export function useRecentAssets(): [string[], (assetId: string) => void] {
  const [recent, setRecent] = useState<string[]>(read)
  const remember = useCallback((assetId: string) => {
    setRecent((current) => {
      const next = [assetId, ...current.filter((id) => id !== assetId)].slice(
        0,
        MAX
      )
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Private mode / blocked storage: keep it for this page view only.
      }
      return next
    })
  }, [])
  return [recent, remember]
}
