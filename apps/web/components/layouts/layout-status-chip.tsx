import { StarIcon } from "lucide-react"

import type { LayoutStatus } from "@roomer/core/schema"
import { Badge } from "@roomer/ui/components/badge"
import { cn } from "@roomer/ui/lib/utils"

export const LAYOUT_STATUS_LABELS: Record<LayoutStatus, string> = {
  draft: "Draft",
  candidate: "Candidate",
  favourite: "Favourite",
  archived: "Archived",
}

const VARIANTS = {
  draft: "outline",
  candidate: "oak",
  favourite: "clay",
  archived: "secondary",
} as const satisfies Record<
  LayoutStatus,
  "outline" | "oak" | "clay" | "secondary"
>

/** draft · candidate · favourite (clay, starred) · archived. */
export function LayoutStatusChip({
  status,
  className,
}: {
  status: LayoutStatus
  className?: string
}) {
  return (
    <Badge
      variant={VARIANTS[status]}
      data-status={status}
      className={cn("h-[18px] px-1.5", className)}
    >
      {status === "favourite" ? (
        <StarIcon data-icon="inline-start" className="fill-current" />
      ) : null}
      {LAYOUT_STATUS_LABELS[status]}
    </Badge>
  )
}
