import { cn } from "@roomer/ui/lib/utils"

/** A numbered styleguide section: title column on the left, specimens right. */
export function Section({
  id,
  index,
  title,
  description,
  stacked = false,
  children,
  className,
}: {
  id: string
  index: number
  title: string
  description?: React.ReactNode
  /** Header above full-width content, instead of beside it. */
  stacked?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "grid scroll-mt-20 gap-8 border-t border-border pt-10",
        !stacked && "min-[1100px]:grid-cols-[220px_minmax(0,1fr)]",
        className
      )}
    >
      <header
        className={cn(
          "flex flex-col gap-2",
          !stacked &&
            "min-[1100px]:sticky min-[1100px]:top-8 min-[1100px]:self-start"
        )}
      >
        <span className="font-mono text-2xs text-muted-foreground tabular-nums">
          {String(index).padStart(2, "0")}
        </span>
        <h2
          id={`${id}-title`}
          className="font-display text-[1.75rem] leading-none font-normal tracking-[-0.02em] text-foreground"
        >
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              "text-ui leading-relaxed text-muted-foreground",
              stacked ? "max-w-[72ch]" : "max-w-[28ch]"
            )}
          >
            {description}
          </p>
        ) : null}
      </header>
      <div className="flex min-w-0 flex-col gap-8">{children}</div>
    </section>
  )
}

/** A labelled specimen: small-caps caption over a framed (or bare) sample. */
export function Specimen({
  label,
  note,
  framed = true,
  width,
  children,
  className,
}: {
  label: string
  note?: string
  framed?: boolean
  /** Fixed width in px, to show a component at its real rail width. */
  width?: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <figure
      className={cn("flex min-w-0 flex-col gap-2.5", className)}
      style={width ? { width } : undefined}
    >
      <figcaption className="flex items-baseline gap-2">
        <span className="eyebrow">{label}</span>
        {note ? (
          <span className="text-2xs text-muted-foreground">{note}</span>
        ) : null}
      </figcaption>
      {framed ? (
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-hairline">
          {children}
        </div>
      ) : (
        children
      )}
    </figure>
  )
}
