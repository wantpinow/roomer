import * as React from "react"
import { cn } from "@roomer/ui/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-input bg-card px-2.5 py-1 text-base shadow-hairline transition-[color,border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-rule focus-visible:border-ring/70 focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60 aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error/15 md:text-ui",
        className
      )}
      {...props}
    />
  )
}

export { Input }
