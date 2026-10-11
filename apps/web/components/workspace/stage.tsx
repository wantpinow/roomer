import { cn } from "@roomer/ui/lib/utils"

/**
 * The viewer's stage: a drafting-paper field that holds the plan or 3D
 * viewer, with floating slots — `toolbar` top-centre (view mode), `controls`
 * bottom-right (zoom/fit), `overlay` bottom-left (legends, hover readouts) —
 * and a title-block `caption` strip along the bottom edge.
 */
export function Stage({
  children,
  toolbar,
  controls,
  overlay,
  caption,
  className,
}: {
  /** The viewer itself; it should fill its parent. */
  children?: React.ReactNode
  toolbar?: React.ReactNode
  controls?: React.ReactNode
  overlay?: React.ReactNode
  caption?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="stage"
      className={cn("flex h-full min-h-0 flex-col", className)}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background bg-drafting">
        <div className="absolute inset-0">{children}</div>
        {toolbar ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-14">
            <div className="pointer-events-auto">{toolbar}</div>
          </div>
        ) : null}
        {overlay ? (
          <div className="absolute bottom-3 left-3 z-10 max-w-[60%]">
            {overlay}
          </div>
        ) : null}
        {controls ? (
          <div className="absolute right-3 bottom-3 z-10">{controls}</div>
        ) : null}
      </div>
      {caption ? (
        <div className="shrink-0 border-t border-border bg-card">{caption}</div>
      ) : null}
    </div>
  )
}

/** The floating surface used by stage toolbars and controls. */
export function FloatingBar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="floating-bar"
      className={cn(
        "flex items-center gap-0.5 rounded-full border border-border bg-popover p-1 shadow-float",
        className
      )}
      {...props}
    />
  )
}
