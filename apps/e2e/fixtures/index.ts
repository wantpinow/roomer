/**
 * The extended `test` every spec imports.
 *
 * Wired in here: a `consoleErrors` auto-fixture, which fails any test that
 * logged a React error, threw on the page, or surfaced a Convex error. That
 * turns the whole suite into a detector for hydration mismatches,
 * `useQuery`-in-`useEffect` loops and unhandled ConvexErrors without any spec
 * having to ask for it. (Ported from masterguest.)
 */
import { test as base } from "@playwright/test"

import { resetAndSeed, type SeedResult } from "./convex"

export { expect } from "@playwright/test"
export { api, convex, resetAndSeed, type SeedResult } from "./convex"

/**
 * Dev-server and browser noise that says nothing about the product. Keep this
 * list short and specific — every entry is a class of bug the suite stops
 * seeing.
 */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon\.ico/i,
]

/**
 * Lets a test declare errors it *expects* the browser to log, so a spec that
 * tests a failure path is not punished for it.
 */
export interface ConsoleGuard {
  errors: string[]
  allow(...patterns: (string | RegExp)[]): void
}

interface Fixtures {
  consoleErrors: ConsoleGuard
  /**
   * A wiped backend with the living room, the generic library and the
   * "Starter" layout seeded through the trapdoor — every spec's clean slate.
   * Ask for it and the test owns the database for its duration.
   */
  livingRoom: SeedResult
}

export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = []
      const allowed: RegExp[] = []
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text())
      })
      page.on("pageerror", (error) =>
        errors.push(`pageerror: ${error.message}`)
      )

      const guard: ConsoleGuard = {
        errors,
        allow: (...patterns) => {
          for (const pattern of patterns) {
            allowed.push(
              typeof pattern === "string"
                ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                : pattern
            )
          }
        },
      }

      await use(guard)

      // Only assert on a test that otherwise passed; a failing test has
      // already told the truth, and console noise would bury its message.
      if (testInfo.status !== "passed") return
      const unexpected = errors.filter(
        (message) =>
          !IGNORED_CONSOLE.some((pattern) => pattern.test(message)) &&
          !allowed.some((pattern) => pattern.test(message))
      )
      if (unexpected.length > 0) {
        throw new Error(
          `Console errors during a passing test:\n  ${unexpected.join("\n  ")}\n` +
            "If one is expected, declare it with consoleErrors.allow(...)."
        )
      }
    },
    { auto: true },
  ],

  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure
  livingRoom: async ({}, use) => {
    await use(await resetAndSeed())
  },
})
