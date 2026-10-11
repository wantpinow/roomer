"use client"

import { useCallback, useSyncExternalStore } from "react"

import { THEME_STORAGE_KEY } from "./theme-script"

export type Theme = "light" | "dark"

const DARK_QUERY = "(prefers-color-scheme: dark)"

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return value === "light" || value === "dark" ? value : null
  } catch {
    return null
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

function subscribe(onChange: () => void): () => void {
  // The <html> class is the source of truth (ThemeScript sets it before
  // paint); watch it so every consumer stays in step.
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  // With no explicit choice, follow the OS as it changes.
  const media = window.matchMedia(DARK_QUERY)
  const onMedia = (event: MediaQueryListEvent) => {
    if (storedTheme() === null) applyTheme(event.matches ? "dark" : "light")
  }
  media.addEventListener("change", onMedia)
  return () => {
    observer.disconnect()
    media.removeEventListener("change", onMedia)
  }
}

/**
 * The current theme and a setter that persists the choice. `theme` is `null`
 * during SSR and hydration (the server can't know), so render something
 * theme-neutral until it resolves.
 */
export function useTheme(): {
  theme: Theme | null
  setTheme: (theme: Theme) => void
} {
  const theme = useSyncExternalStore<Theme | null>(
    subscribe,
    readTheme,
    () => null
  )
  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Private mode / blocked storage: still switch for this page view.
    }
    applyTheme(next)
  }, [])
  return { theme, setTheme }
}
