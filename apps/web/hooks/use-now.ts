"use client"

import { useEffect, useState } from "react"

/**
 * The current time, refreshed every `intervalMs` — for "live in the last
 * minute" style checks. Starts from the mount time, so render stays pure.
 */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
