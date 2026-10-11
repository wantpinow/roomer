import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL("./", import.meta.url))

export default defineConfig({
  // Next compiles JSX itself, so the tsconfig says `preserve` — Vite's
  // transformer has to be told to actually compile it for component tests.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    // Only the `@/` app alias — a bare `@` prefix would also swallow the
    // `@roomer/*` workspace packages.
    alias: [{ find: /^@\//, replacement: root }],
  },
  test: {
    include: [
      "lib/**/tests/**/*.test.{ts,tsx}",
      "server/**/tests/**/*.test.{ts,tsx}",
      "components/**/tests/**/*.test.{ts,tsx}",
    ],
  },
})
