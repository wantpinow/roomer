"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@roomer/ui/lib/utils"

export interface NavItem {
  href: string
  label: string
  /** Path prefixes that also mark this item active (e.g. "/rooms"). */
  matches?: readonly string[]
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/", label: "Rooms", matches: ["/rooms"] },
  { href: "/library", label: "Library", matches: ["/library"] },
]

function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true
  return (item.matches ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/** The top bar's section links; the active one carries a short clay rule. */
export function PrimaryNav({
  items = PRIMARY_NAV,
  className,
}: {
  items?: readonly NavItem[]
  className?: string
}) {
  const pathname = usePathname()
  return (
    <nav aria-label="Primary" className={cn("flex items-center", className)}>
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActive(item, pathname)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-8 items-center rounded-md px-2.5 text-ui font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45",
                  "after:absolute after:inset-x-2.5 after:-bottom-[9px] after:h-[1.5px] after:rounded-full after:bg-clay-fill after:opacity-0 after:transition-opacity",
                  active && "text-foreground after:opacity-100"
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
