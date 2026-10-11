import type { LintSeverity } from "@roomer/core/schema"
import { cn } from "@roomer/ui/lib/utils"

const LABELS: Record<LintSeverity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Note",
}

/**
 * Severity marks that differ by shape as well as colour (so they survive
 * colour-blindness and greyscale print): a solid dot for errors, a solid
 * triangle for warnings, a ring for notes.
 */
export function SeverityIcon({
  severity,
  size = 10,
  label,
  className,
}: {
  severity: LintSeverity
  /** Pixel size of the mark. */
  size?: number
  /** Accessible name; pass `false` when the text beside it already says it. */
  label?: string | false
  className?: string
}) {
  const name = label === undefined ? LABELS[severity] : label
  return (
    <svg
      data-slot="severity-icon"
      data-severity={severity}
      viewBox="0 0 10 10"
      // Inline size: parents often force `svg` sizes with descendant rules.
      style={{ width: size, height: size }}
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      className={cn(
        "shrink-0",
        severity === "error" && "text-error-fill",
        severity === "warning" && "text-warning-fill",
        severity === "info" && "text-info-fill",
        className
      )}
    >
      {severity === "error" ? (
        <circle cx="5" cy="5" r="4" fill="currentColor" />
      ) : severity === "warning" ? (
        <path
          d="M5 1.2 9.1 8.4H.9Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      ) : (
        <circle
          cx="5"
          cy="5"
          r="3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      )}
    </svg>
  )
}
