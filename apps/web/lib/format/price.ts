// Prices in the UI. Castlery lists whole pounds, so whole amounts drop the
// pence ("£1,698"); anything else keeps two places ("£1,698.50").

export const DEFAULT_CURRENCY = "GBP"

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, fractionDigits: 0 | 2): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits}`
  let cached = formatters.get(key)
  if (!cached) {
    cached = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
    formatters.set(key, cached)
  }
  return cached
}

/** 1698 → "£1,698"; 1698.5 → "£1,698.50"; (99, "EUR") → "€99". */
export function formatPrice(
  amount: number,
  currency: string = DEFAULT_CURRENCY
): string {
  const whole = Math.abs(amount - Math.round(amount)) < 0.005
  return formatter(currency, whole ? 0 : 2).format(
    whole ? Math.round(amount) : amount
  )
}

export interface Priced {
  price?: number
  currency?: string
}

export interface PriceTotal {
  /** Sum of every priced line in `currency`. */
  total: number
  currency: string
  /** Lines with a price that were counted. */
  priced: number
  /** Lines with no price (custom or unknown items). */
  unpriced: number
  /** Lines in a different currency than the first priced one; not summed. */
  otherCurrency: number
}

/**
 * Totals a list of priced lines. The first priced line fixes the currency;
 * lines in any other currency are counted but not added (no FX in v1).
 */
export function totalPrice(
  lines: readonly Priced[],
  fallbackCurrency: string = DEFAULT_CURRENCY
): PriceTotal {
  const result: PriceTotal = {
    total: 0,
    currency: fallbackCurrency,
    priced: 0,
    unpriced: 0,
    otherCurrency: 0,
  }
  let currency: string | undefined
  for (const line of lines) {
    if (line.price === undefined) {
      result.unpriced += 1
      continue
    }
    const lineCurrency = line.currency ?? fallbackCurrency
    currency ??= lineCurrency
    if (lineCurrency !== currency) {
      result.otherCurrency += 1
      continue
    }
    result.total += line.price
    result.priced += 1
  }
  result.currency = currency ?? fallbackCurrency
  return result
}
