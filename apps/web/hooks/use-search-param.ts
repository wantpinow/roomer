"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

/**
 * One URL search parameter as state (`?layout=…`), written with
 * `router.replace` so it doesn't pile up history or scroll the page.
 */
export function useSearchParam(
  name: string
): [string | null, (value: string | null) => void] {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const value = searchParams.get(name)
  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === null) params.delete(name)
      else params.set(name, next)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [name, pathname, router, searchParams]
  )
  return [value, setValue]
}
