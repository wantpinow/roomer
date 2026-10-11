import type { Page } from "@playwright/test"

import { expect, test, type SeedResult } from "../fixtures"

/**
 * The cheapest coverage in the suite: every top-level route renders its real
 * content without hitting the error boundary and without a console error
 * (the `consoleErrors` auto-fixture). Each route waits for something only a
 * live, data-backed render shows, so late errors (a query failing after
 * hydration, a WebGL context that won't start) surface here too.
 */

const ERROR_BOUNDARY = "#__next_error__"

interface Route {
  name: string
  path: (seed: SeedResult) => string
  /** What the route shows once its data and client code are live. */
  ready: (page: Page, seed: SeedResult) => Promise<void>
}

const ROUTES: Route[] = [
  {
    name: "rooms index",
    path: () => "/",
    ready: async (page, seed) => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Rooms." })
      ).toBeVisible()
      const card = page.locator(`a[data-room-id="${seed.roomId}"]`)
      await expect(card).toBeVisible()
      await expect(card).toContainText("Living room")
      await expect(card).toContainText("Starter")
    },
  },
  {
    name: "room workspace",
    path: (seed) => `/rooms/${seed.roomId}`,
    ready: async (page) => {
      const plan = page.locator('[data-slot="plan-view"]')
      await expect(plan).toBeVisible()
      await expect(plan.locator("[data-hit-id]")).toHaveCount(3)
      await expect(
        page.getByRole("tab", { name: /^Issues/ }),
        "the inspector shows the lint tally"
      ).toBeVisible()
    },
  },
  {
    name: "library",
    path: () => "/library",
    ready: async (page, seed) => {
      await expect(page.locator('[data-slot="asset-card"]')).toHaveCount(
        Object.keys(seed.assetIds).length
      )
    },
  },
  {
    name: "asset page",
    path: (seed) => `/library/${seed.assetIds["generic-sofa"]}`,
    ready: async (page) => {
      await expect(page.locator('[data-slot="asset-detail"]')).toContainText(
        "Generic three-seat sofa"
      )
      await expect(
        page.locator('[data-slot="asset-turntable"] canvas')
      ).toBeVisible()
    },
  },
  {
    name: "styleguide",
    path: () => "/styleguide",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { level: 1, name: /A calm studio/ })
      ).toBeVisible()
      await expect(
        page.getByRole("navigation", { name: "Sections" })
      ).toBeVisible()
    },
  },
  {
    name: "scene sandbox",
    path: () => "/render/sandbox",
    ready: async (page) => {
      await expect(page.locator("canvas").first()).toBeVisible()
    },
  },
  {
    name: "headless render page",
    path: () => "/render",
    ready: async (page) => {
      await page.waitForFunction(() => window.roomer?.ready === true)
    },
  },
]

declare global {
  interface Window {
    roomer?: { ready?: boolean }
  }
}

for (const route of ROUTES) {
  test(`${route.name} renders without errors`, async ({ page, livingRoom }) => {
    const path = route.path(livingRoom)
    const response = await page.goto(path)
    expect(response?.status(), `${path} returned an error status`).toBeLessThan(
      400
    )
    await route.ready(page, livingRoom)
    await expect(
      page.locator(ERROR_BOUNDARY),
      `${path} hit the error boundary`
    ).toHaveCount(0)
  })
}

test("a room that doesn't exist explains itself", async ({
  page,
  livingRoom,
}) => {
  // A well-formed id from another table: the query answers null, not 500.
  await page.goto(`/rooms/${livingRoom.layoutId}`)
  await expect(page.getByText("There's no room here")).toBeVisible()
  await expect(page.locator(ERROR_BOUNDARY)).toHaveCount(0)
})
