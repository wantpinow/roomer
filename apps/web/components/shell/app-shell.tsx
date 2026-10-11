import { cn } from "@roomer/ui/lib/utils"

import { TopBar } from "./top-bar"

/**
 * Page chrome for the app (not the bare /render page): the top bar over a
 * full-height main area. Workspace pages fill the area; others scroll in it.
 */
export function AppShell({
  children,
  context,
  status,
  className,
}: {
  children: React.ReactNode
  /** Shown in the top bar after the nav, e.g. the current room's name. */
  context?: React.ReactNode
  /** Right-hand status slot, e.g. <AgentStatus />. */
  status?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="app-shell"
      className="bg-grain flex h-svh min-h-0 flex-col bg-background"
    >
      <TopBar context={context} status={status} />
      <main
        data-page-root
        className={cn("flex min-h-0 flex-1 flex-col overflow-auto", className)}
      >
        {children}
      </main>
    </div>
  )
}
