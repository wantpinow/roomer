import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  server: {
    // Vercel AI Gateway key for photoreal renders. Lives in the repo-root
    // .env.local (loaded by load-root-env.ts). Optional so the app boots
    // without it; the photoreal pipeline refuses to run live when unset.
    AI_GATEWAY_API_KEY: z.string().optional(),
    // "1" swaps the photoreal renderer for the free deterministic stub (the
    // e2e default, see dev:e2e).
    PHOTOREAL_STUB: z.string().optional(),
    // Server-side Convex URL (ConvexHttpClient in server/). Defaults to the
    // public one when unset.
    CONVEX_URL: z.url().optional(),
  },
  client: {
    // The local Convex deployment: :3210 under `pnpm dev` (apps/web/.env),
    // :3220 under `dev:e2e`.
    NEXT_PUBLIC_CONVEX_URL: z.url(),
  },
  runtimeEnv: {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    PHOTOREAL_STUB: process.env.PHOTOREAL_STUB,
    CONVEX_URL: process.env.CONVEX_URL,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
