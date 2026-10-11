// Runs before every test file, before any module under test is imported.
if (typeof process !== "undefined") {
  // Skip env validation in anything that validates (none yet; mirrors
  // masterguest so a future convex/env.ts works in tests unchanged).
  process.env.SKIP_ENV_VALIDATION = "1"
}
