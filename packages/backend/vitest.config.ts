import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Matches the Convex runtime (V8 isolate, no Node APIs). convex-test is
    // inlined so Vite transforms it with the same environment.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/vitest.setup.ts"],
  },
})
