// Declare Vite's import.meta.glob for tsc (only available at Vitest runtime)
declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>
  }
}

import { convexTest } from "convex-test"

import schema from "../convex/schema"

// Every Convex module, discovered by Vite. The glob is relative to THIS file
// (tests/setup.ts), so ../convex/ reaches the function files. Tests live
// outside convex/ so the Convex bundler never tries to deploy them.
const modules = import.meta.glob("../convex/**/*.*s")

/** A fresh in-memory Convex deployment for one test. */
export function createTestConvex() {
  return convexTest(schema, modules)
}

/** Concrete type for the test harness — use this for all helper parameter types. */
export type TestConvex = ReturnType<typeof createTestConvex>
