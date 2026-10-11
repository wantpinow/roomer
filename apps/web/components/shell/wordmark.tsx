import { cn } from "@roomer/ui/lib/utils"

/**
 * "roomer" in lowercase Newsreader, closed by a small clay dot where a full
 * stop would sit — the only flourish in the chrome.
 */
export function Wordmark({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  return (
    <span
      data-slot="wordmark"
      className={cn(
        "inline-flex items-baseline font-display leading-none font-[420] tracking-[-0.02em] text-foreground select-none",
        size === "sm" && "text-lg",
        size === "md" && "text-[1.375rem]",
        size === "lg" && "text-4xl",
        className
      )}
    >
      roomer
      <span
        aria-hidden
        className="ml-[0.08em] inline-block size-[0.2em] translate-y-[-0.02em] rounded-full bg-clay-fill"
      />
    </span>
  )
}
