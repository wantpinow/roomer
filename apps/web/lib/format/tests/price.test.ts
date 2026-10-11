import { describe, expect, it } from "vitest"

import { formatPrice, totalPrice } from "../price"

describe("formatPrice", () => {
  it("drops pence on whole amounts", () => {
    expect(formatPrice(1698)).toBe("£1,698")
    expect(formatPrice(0)).toBe("£0")
  })

  it("keeps two places otherwise", () => {
    expect(formatPrice(1698.5)).toBe("£1,698.50")
    expect(formatPrice(9.99)).toBe("£9.99")
  })

  it("treats float noise as whole", () => {
    expect(formatPrice(0.1 + 0.2 + 1698.7)).toBe("£1,699")
  })

  it("formats other currencies", () => {
    expect(formatPrice(99, "EUR")).toBe("€99")
    expect(formatPrice(1250, "USD")).toBe("US$1,250")
  })
})

describe("totalPrice", () => {
  it("sums priced lines in the first line's currency", () => {
    expect(
      totalPrice([
        { price: 1698, currency: "GBP" },
        { price: 449, currency: "GBP" },
      ])
    ).toEqual({
      total: 2147,
      currency: "GBP",
      priced: 2,
      unpriced: 0,
      otherCurrency: 0,
    })
  })

  it("counts unpriced lines without adding them", () => {
    const result = totalPrice([{ price: 239 }, {}, { price: 239 }])
    expect(result.total).toBe(478)
    expect(result.unpriced).toBe(1)
    expect(result.currency).toBe("GBP")
  })

  it("skips lines in a second currency", () => {
    const result = totalPrice([
      { price: 100, currency: "EUR" },
      { price: 50, currency: "GBP" },
      { price: 25, currency: "EUR" },
    ])
    expect(result).toMatchObject({
      total: 125,
      currency: "EUR",
      priced: 2,
      otherCurrency: 1,
    })
  })

  it("falls back to the default currency when nothing is priced", () => {
    expect(totalPrice([{}, {}], "USD")).toEqual({
      total: 0,
      currency: "USD",
      priced: 0,
      unpriced: 2,
      otherCurrency: 0,
    })
  })
})
