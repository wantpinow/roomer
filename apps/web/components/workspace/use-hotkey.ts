"use client"

import { useEffect, useRef } from "react"

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * Calls `handler` when `key` is pressed with no modifiers, unless focus is in
 * a text field. Used for the workspace's single-key shortcuts ([ ] P 3 C).
 */
export function useHotkey(
  key: string,
  handler: () => void,
  enabled = true
): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() !== key.toLowerCase()) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      handlerRef.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [key, enabled])
}
