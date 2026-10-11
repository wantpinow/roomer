import { TEST_ASSETS } from "@roomer/core/fixtures"

import { api, convex, expect, test } from "../fixtures"
import { OAK_SIDEBOARD, OAK_SIDEBOARD_PRICE } from "../fixtures/assets"

/**
 * The furniture library: every seeded piece is listed, search and the
 * category and source filters narrow it (and live in the URL), and an
 * asset's page shows its size, price and the turning clay model.
 */

const SEEDED_NAMES = Object.values(TEST_ASSETS).map((asset) =>
  asset.name.replace(/^Test /, "Generic ")
)

test("the library lists every piece, and search and filters narrow it", async ({
  page,
  livingRoom,
}) => {
  const { assetId } = await convex.mutation(api.assets.create, OAK_SIDEBOARD)
  const cards = page.locator('[data-slot="asset-card"]')
  const count = page.getByText(/^\d+ pieces?$/)

  await page.goto("/library")
  await expect(cards).toHaveCount(SEEDED_NAMES.length + 1)
  await expect(count).toHaveText(`${SEEDED_NAMES.length + 1} pieces`)
  for (const name of [...SEEDED_NAMES, OAK_SIDEBOARD.name]) {
    await expect(cards.filter({ hasText: name })).toHaveCount(1)
  }
  for (const id of Object.values(livingRoom.assetIds)) {
    await expect(
      cards.and(page.locator(`[data-asset-id="${id}"]`))
    ).toHaveCount(1)
  }

  // Search by name (debounced, then in the URL).
  const search = page.getByRole("searchbox", { name: "Search the library" })
  await search.fill("sideboard")
  await expect(page).toHaveURL(/[?&]q=sideboard/)
  await expect(cards).toHaveCount(2)
  await expect(cards.filter({ hasText: "Generic sideboard" })).toHaveCount(1)
  await expect(cards.filter({ hasText: OAK_SIDEBOARD.name })).toHaveCount(1)
  await search.fill("no such piece of furniture")
  await expect(page.getByText("Nothing matches")).toBeVisible()
  await expect(cards).toHaveCount(0)
  await page.getByRole("button", { name: "Clear search" }).click()
  await expect(cards).toHaveCount(SEEDED_NAMES.length + 1)
  await expect(page).not.toHaveURL(/[?&]q=/)

  // Category: tables only.
  const categories = page.getByRole("radiogroup", { name: "Category" })
  await categories.getByRole("radio", { name: "Table", exact: true }).click()
  await expect(page).toHaveURL(/[?&]category=table/)
  await expect(cards).toHaveCount(2)
  await expect(cards.filter({ hasText: "Generic coffee table" })).toHaveCount(1)
  await expect(cards.filter({ hasText: "Generic dining table" })).toHaveCount(1)

  // Category and source together: storage the agent built (not starters).
  await categories.getByRole("radio", { name: "Storage", exact: true }).click()
  await expect(cards).toHaveCount(2)
  await page
    .getByRole("radiogroup", { name: "Source" })
    .getByRole("radio", { name: "Yours" })
    .click()
  await expect(page).toHaveURL(/[?&]source=custom/)
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toHaveAttribute("data-asset-id", assetId)

  // Filters survive a reload (they live in the URL).
  await page.reload()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(OAK_SIDEBOARD.name)

  await categories.getByRole("radio", { name: "All", exact: true }).click()
  await page
    .getByRole("radiogroup", { name: "Source" })
    .getByRole("radio", { name: "All" })
    .click()
  await expect(cards).toHaveCount(SEEDED_NAMES.length + 1)
})

test("an asset's page shows its size, price and turning clay model", async ({
  page,
  livingRoom,
}) => {
  void livingRoom
  const { assetId } = await convex.mutation(api.assets.create, OAK_SIDEBOARD)

  await page.goto("/library")
  await page
    .locator(`[data-slot="asset-card"][data-asset-id="${assetId}"]`)
    .click()
  await expect(page).toHaveURL(new RegExp(`/library/${assetId}$`))
  await expect(page).toHaveTitle(/Oak sideboard/)

  const detail = page.locator('[data-slot="asset-detail"]')
  await expect(detail).toHaveAttribute("data-asset-id", assetId)
  await expect(
    detail.getByRole("heading", { name: OAK_SIDEBOARD.name })
  ).toBeVisible()
  await expect(detail.locator('[data-slot="price"]').first()).toHaveText(
    OAK_SIDEBOARD_PRICE
  )
  const { w, d, h } = OAK_SIDEBOARD.dims
  const fmt = (mm: number) => mm.toLocaleString("en-GB")
  await expect(detail.locator('[data-slot="dims"]')).toHaveAttribute(
    "aria-label",
    `${fmt(w)} × ${fmt(d)} × ${fmt(h)} mm`
  )
  await expect(detail).toContainText("from the listing")
  await expect(detail).toContainText(OAK_SIDEBOARD.product.retailer)
  await expect(detail).toContainText(OAK_SIDEBOARD.product.variant)
  await expect(detail).toContainText(OAK_SIDEBOARD.key)
  await expect(
    detail.getByRole("link", { name: "View product" })
  ).toHaveAttribute("href", OAK_SIDEBOARD.product.url)

  // The clay model turns in a live canvas, captioned with its part count.
  const turntable = page.locator('[data-slot="asset-turntable"]')
  await expect(turntable.locator("canvas")).toBeVisible()
  const parts =
    OAK_SIDEBOARD.geometry.kind === "parts"
      ? OAK_SIDEBOARD.geometry.parts.length
      : 0
  await expect(turntable).toContainText(`${parts} parts`)
  // Let it draw a few frames so a WebGL failure would reach the console.
  await page.waitForTimeout(500)

  await page
    .locator("[data-page-root]")
    .getByRole("link", { name: "Library" })
    .click()
  await expect(page).toHaveURL(/\/library$/)
})
