import "./load-root-env"
import "./env"

import type { NextConfig } from "next"

// The Playwright suite runs its own dev server on port 3100 against the e2e
// Convex backend (port 3220). It gets its own build directory so a concurrent
// `pnpm dev` on port 3000 is not fighting it for `.next`.
const isE2E = process.env.E2E_TESTING === "true"

const nextConfig: NextConfig = {
  ...(isE2E ? { distDir: ".next-e2e" } : {}),
  // Internal packages export raw .ts; Next compiles them.
  transpilePackages: ["@roomer/ui", "@roomer/backend", "@roomer/core"],
  // Native/binary server deps (headless renderer, plan PNG rasteriser) must
  // not be bundled.
  serverExternalPackages: ["playwright", "@resvg/resvg-js"],
}

export default nextConfig
