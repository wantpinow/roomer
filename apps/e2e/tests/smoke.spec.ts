import { convex, expect, test } from "../fixtures"

/**
 * The cheapest coverage in the suite: the home page renders without an error
 * boundary or a console error (the `consoleErrors` auto-fixture), and it is
 * live-wired to Convex — the ping answers, and a row written on the server
 * shows up without a reload.
 */

const ERROR_BOUNDARY = "#__next_error__"

test("home renders and is live-wired to Convex", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.status(), "/ returned an error status").toBeLessThan(400)
  await expect(
    page.locator(ERROR_BOUNDARY),
    "/ hit the error boundary"
  ).toHaveCount(0)
  await expect(page.locator("[data-page-root]")).toBeVisible()

  await expect(page.getByTestId("ping-status")).toHaveText("pong")

  const note = `e2e-${test.info().testId}`
  await convex.recordHealthcheck(note)
  await expect(page.getByTestId("ping-note")).toHaveText(note)
})
