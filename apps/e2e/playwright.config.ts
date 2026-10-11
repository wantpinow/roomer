import { defineConfig, devices } from "@playwright/test"

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100"
const CONVEX_URL = process.env.E2E_CONVEX_URL ?? "http://127.0.0.1:3220"
const CI = !!process.env.CI
/**
 * `E2E_PHOTOREAL_LIVE=1` opts into photoreal-live.spec.ts, the one spec that
 * spends money: Next then starts without the photoreal stub. Every other
 * spec asks for the "stub" model explicitly, so it stays free either way.
 */
const PHOTOREAL_LIVE = process.env.E2E_PHOTOREAL_LIVE === "1"

/**
 * The stack under test is the real one: a Convex local backend
 * (packages/backend, booted by scripts/e2e-backend.ts on :3220/:3221) and the
 * Next dev server on :3100 (`dev:e2e`, `.next-e2e` build dir, photoreal stub
 * on unless E2E_PHOTOREAL_LIVE=1). Both are started here and reused when
 * already running. Different ports from `pnpm dev` (3000/3210), so an e2e run
 * never touches the dev stack.
 */
export default defineConfig({
  testDir: "./tests",
  // Specs share one deployment and each starts by wiping it (the
  // `livingRoom` fixture), so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 90_000,
  // Turbopack compiles each route on first visit; first paints are slow.
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: CI ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @roomer/backend e2e:backend",
      url: `${CONVEX_URL}/version`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter web dev:e2e",
      env: { E2E_PHOTOREAL_STUB: PHOTOREAL_LIVE ? "0" : "1" },
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
})
