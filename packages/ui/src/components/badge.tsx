import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@roomer/ui/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 text-2xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/45 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/85",
        secondary:
          "bg-secondary text-ink-soft [a]:hover:bg-accent [a]:hover:text-foreground",
        outline:
          "border-border bg-transparent text-ink-soft [a]:hover:bg-accent [a]:hover:text-foreground",
        clay: "bg-clay-tint text-clay",
        oak: "bg-oak-tint text-oak",
        sage: "bg-sage-tint text-sage",
        error: "bg-error-tint text-error",
        warning: "bg-warning-tint text-warning",
        info: "bg-info-tint text-info",
        destructive: "bg-error-tint text-error",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
