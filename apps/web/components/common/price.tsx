import { cn } from "@roomer/ui/lib/utils"

import { DEFAULT_CURRENCY, formatPrice } from "@/lib/format/price"

/** A price in tabular figures: £1,698. Renders an em dash when unknown. */
export function Price({
  amount,
  currency = DEFAULT_CURRENCY,
  className,
}: {
  amount: number | undefined
  currency?: string
  className?: string
}) {
  return (
    <span
      data-slot="price"
      className={cn(
        "whitespace-nowrap tabular-nums",
        amount === undefined && "text-faint",
        className
      )}
    >
      {amount === undefined ? (
        <>
          <span aria-hidden>—</span>
          <span className="sr-only">No price</span>
        </>
      ) : (
        formatPrice(amount, currency)
      )}
    </span>
  )
}
