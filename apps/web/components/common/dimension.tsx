import type { Dims as DimsValue } from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

import { formatDims, lengthParts, type LengthUnit } from "@/lib/format/length"

/**
 * One length, typeset: tabular figures, a quieter unit, never wrapped.
 * `2980` → 2,980 mm (or 2.98 m with `unit="m"`).
 */
export function Dimension({
  mm,
  unit = "mm",
  className,
}: {
  mm: number
  unit?: LengthUnit
  className?: string
}) {
  const parts = lengthParts(mm, unit)
  return (
    <span
      data-slot="dimension"
      className={cn("whitespace-nowrap tabular-nums", className)}
    >
      {parts.value}
      <span className="text-muted-foreground"> {parts.unit}</span>
    </span>
  )
}

/** Overall size, W × D × H, with the unit once at the end. */
export function Dims({
  dims,
  unit = "mm",
  className,
}: {
  dims: DimsValue
  unit?: LengthUnit
  className?: string
}) {
  const values = [dims.w, dims.d, dims.h].map((v) => lengthParts(v, unit).value)
  return (
    <span
      data-slot="dims"
      aria-label={formatDims(dims, unit)}
      className={cn("whitespace-nowrap tabular-nums", className)}
    >
      {values.map((value, i) => (
        <span key={i}>
          {i > 0 ? <span className="px-0.5 text-faint">×</span> : null}
          {value}
        </span>
      ))}
      <span className="text-muted-foreground"> {unit}</span>
    </span>
  )
}
