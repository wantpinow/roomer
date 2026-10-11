import { describe, expect, it } from "vitest"

import { cn } from "../utils"

describe("cn", () => {
  it("keeps custom font sizes alongside text colours", () => {
    expect(cn("text-ui", "text-foreground")).toBe("text-ui text-foreground")
    expect(cn("text-2xs text-muted-foreground")).toBe(
      "text-2xs text-muted-foreground"
    )
  })

  it("lets a later font size win, custom or default", () => {
    expect(cn("text-ui", "text-sm")).toBe("text-sm")
    expect(cn("text-xs", "text-2xs")).toBe("text-2xs")
  })

  it("merges the custom shadows, easings and animations", () => {
    expect(cn("shadow-soft", "shadow-pop")).toBe("shadow-pop")
    expect(cn("ease-out", "ease-out-soft")).toBe("ease-out-soft")
    expect(cn("animate-pulse", "animate-live")).toBe("animate-live")
  })

  it("still resolves ordinary conflicts", () => {
    expect(cn("px-2", "px-3", false, undefined, "py-1")).toBe("px-3 py-1")
  })
})
