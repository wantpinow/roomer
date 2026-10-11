/**
 * Assets specs create through the public API, built from core's hand-checked
 * test assets so their parts always fit their dims.
 */
import { SIDEBOARD } from "@roomer/core/fixtures"

/** A priced product, as the agent would build one from a retailer link. */
export const OAK_SIDEBOARD = {
  ...SIDEBOARD,
  name: "Oak sideboard",
  key: "e2e-oak-sideboard",
  source: "custom" as const,
  description: "Low sideboard in natural oak with two sliding doors.",
  product: {
    url: "https://example.com/products/oak-sideboard",
    retailer: "Example Interiors",
    variant: "Natural oak",
    price: 1698,
    currency: "GBP",
    dimsSource: "listing" as const,
  },
}

/** `OAK_SIDEBOARD`'s price as the UI formats it. */
export const OAK_SIDEBOARD_PRICE = "£1,698"
