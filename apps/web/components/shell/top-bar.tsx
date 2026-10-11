import Link from "next/link"

import { Separator } from "@roomer/ui/components/separator"
import { cn } from "@roomer/ui/lib/utils"

import { PrimaryNav } from "./primary-nav"
import { ThemeToggle } from "./theme-toggle"
import { Wordmark } from "./wordmark"

/**
 * The thin, quiet, sticky bar over every app page: wordmark and sections on
 * the left, an optional context slot (e.g. the current room) in the middle,
 * a status slot and the theme toggle on the right.
 */
export function TopBar({
  context,
  status,
  className,
}: {
  context?: React.ReactNode
  status?: React.ReactNode
  className?: string
}) {
  return (
    <header
      data-slot="top-bar"
      className={cn(
        "sticky top-0 z-40 flex h-12 shrink-0 items-center gap-4 border-b border-border bg-background px-4",
        className
      )}
    >
      <Link
        href="/"
        aria-label="Roomer home"
        className="-mx-1 rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
      >
        <Wordmark />
      </Link>
      <Separator orientation="vertical" className="my-3.5" />
      <PrimaryNav />
      {context ? (
        <>
          <Separator orientation="vertical" className="my-3.5" />
          <div className="flex min-w-0 items-center gap-2 text-ui text-muted-foreground">
            {context}
          </div>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {status}
        <ThemeToggle />
      </div>
    </header>
  )
}
