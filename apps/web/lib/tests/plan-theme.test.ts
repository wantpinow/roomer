import { describe, expect, it } from "vitest"

import { DEFAULT_PLAN_THEME } from "@roomer/core/plan"

import { designTokens } from "../design-tokens"
import { planTheme } from "../plan-theme"

describe("planTheme", () => {
  // (The type makes sure every required colour is set.)
  it.each(["light", "dark"] as const)(
    "sets only colours core's plan knows, all as hex (%s)",
    (mode) => {
      const theme = planTheme(mode)
      const known = Object.keys(DEFAULT_PLAN_THEME)
      for (const key of Object.keys(theme)) expect(known).toContain(key)
      for (const [key, value] of Object.entries(theme)) {
        if (key === "fontFamily") continue
        expect(value, key).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  )

  it("puts the plan on the stage's paper, so it reads as one sheet", () => {
    expect(planTheme("light").paper).toBe(designTokens.light.paper)
    expect(planTheme("dark").paper).toBe(designTokens.dark.paper)
  })

  it("draws dark-theme walls light", () => {
    expect(planTheme("dark").wall).toBe(designTokens.plan.dark.wallFill)
  })
})
