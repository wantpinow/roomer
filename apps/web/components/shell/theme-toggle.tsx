"use client"

import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@roomer/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@roomer/ui/components/tooltip"
import { cn } from "@roomer/ui/lib/utils"

import { useTheme } from "./use-theme"

/** Switches between the light (paper) and dark (charcoal) themes. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const next = theme === "dark" ? "light" : "dark"
  const label = theme === null ? "Toggle theme" : `Switch to ${next} theme`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          data-theme-toggle={theme ?? undefined}
          onClick={() => setTheme(next)}
          className={cn("relative", className)}
        >
          <SunIcon className="scale-100 rotate-0 transition-transform duration-300 dark:scale-0 dark:-rotate-90" />
          <MoonIcon className="absolute scale-0 rotate-90 transition-transform duration-300 dark:scale-100 dark:rotate-0" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
