/**
 * Loads the repo-root `.env*` files (where `AI_GATEWAY_API_KEY` lives) into
 * process.env. Next only reads env files from apps/web, so without this the
 * server would never see the key.
 *
 * A separate module because ES imports are hoisted: next.config.ts imports
 * this first, then `./env`, so validation sees the loaded values.
 *
 * `next` itself depends on @next/env, so this is the very module instance
 * Next used to load apps/web's env files, and its state is shared:
 *
 *  - Next has already processed env, so without `forceReload` the call below
 *    would return without reading anything.
 *  - A forced reload first resets process.env to the baseline @next/env
 *    captured *before* Next loaded apps/web/.env — which would drop
 *    NEXT_PUBLIC_CONVEX_URL. So the current env is folded into that baseline
 *    first, and the root values afterwards, so Next's own later reloads keep
 *    them too. (Cost: editing an existing value in an env file needs a dev
 *    server restart to take effect.)
 *
 * Values already in process.env — the shell, apps/web's own files — win; root
 * files only fill gaps.
 */
import { fileURLToPath } from "node:url"

import { loadEnvConfig, updateInitialEnv } from "@next/env"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))

updateInitialEnv(process.env)
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", console, true)
updateInitialEnv(process.env)
