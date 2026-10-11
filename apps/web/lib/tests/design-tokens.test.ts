import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { designTokens } from "../design-tokens"

// design-tokens.ts mirrors globals.css by hand; this keeps them honest.

const css = readFileSync(
  fileURLToPath(
    new URL("../../../../packages/ui/src/styles/globals.css", import.meta.url)
  ),
  "utf8"
)

/** `--name: #hex;` declarations inside the first block opened by `selector {`. */
function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  if (start === -1) throw new Error(`No ${selector} block in globals.css`)
  const body = css.slice(start, css.indexOf("\n}", start))
  const vars = new Map<string, string>()
  for (const match of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)) {
    vars.set(match[1]!, match[2]!.toLowerCase())
  }
  return vars
}

// Token name → CSS variable (shadcn role names where they differ).
const CSS_NAME: Record<keyof typeof designTokens.light, string> = {
  paper: "background",
  surface: "card",
  popover: "popover",
  sunken: "muted",
  ink: "foreground",
  inkSoft: "ink-soft",
  muted: "muted-foreground",
  faint: "faint",
  hairline: "border",
  rule: "rule",
  ring: "ring",
  clay: "clay",
  clayFill: "clay-fill",
  clayTint: "clay-tint",
  oak: "oak",
  oakFill: "oak-fill",
  oakTint: "oak-tint",
  sage: "sage",
  sageFill: "sage-fill",
  sageTint: "sage-tint",
  error: "error",
  errorFill: "error-fill",
  errorTint: "error-tint",
  warning: "warning",
  warningFill: "warning-fill",
  warningTint: "warning-tint",
  info: "info",
  infoFill: "info-fill",
  infoTint: "info-tint",
}

describe("designTokens", () => {
  it.each([
    ["light", ":root"],
    ["dark", ".dark"],
  ] as const)("mirrors the %s theme in globals.css", (theme, selector) => {
    const vars = declarations(selector)
    for (const [key, cssName] of Object.entries(CSS_NAME)) {
      expect(
        designTokens[theme][key as keyof typeof CSS_NAME],
        `${theme}.${key} vs --${cssName}`
      ).toBe(vars.get(cssName))
    }
  })
})

/** WCAG relative luminance contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (hi + 0.05) / (lo + 0.05)
}

describe("palette contrast (WCAG AA, 4.5:1 for text)", () => {
  const TEXT = [
    "ink",
    "inkSoft",
    "muted",
    "clay",
    "oak",
    "sage",
    "error",
    "warning",
    "info",
  ] as const
  const GROUNDS = ["paper", "surface", "popover", "sunken"] as const

  it.each(["light", "dark"] as const)(
    "text tones read on every %s surface",
    (theme) => {
      const t = designTokens[theme]
      for (const fg of TEXT) {
        for (const bg of GROUNDS) {
          expect(
            contrast(t[fg], t[bg]),
            `${theme}: ${fg} on ${bg}`
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  )

  it.each(["light", "dark"] as const)(
    "severity and accent text reads on its own tint (%s)",
    (theme) => {
      const t = designTokens[theme]
      const pairs = [
        ["error", "errorTint"],
        ["warning", "warningTint"],
        ["info", "infoTint"],
        ["clay", "clayTint"],
        ["oak", "oakTint"],
        ["sage", "sageTint"],
      ] as const
      for (const [fg, bg] of pairs) {
        expect(
          contrast(t[fg], t[bg]),
          `${theme}: ${fg} on ${bg}`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  )
})
