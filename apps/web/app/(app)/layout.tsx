import { AppShell } from "@/components/shell/app-shell"
import { LiveAgentStatus } from "@/components/shell/live-agent-status"
import { Toaster } from "@roomer/ui/components/toast"

/**
 * Chrome for the app's pages (rooms, workspace, library). The bare /render
 * page and the dev styleguide live outside this group.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Toaster position="bottom-right">
      <AppShell status={<LiveAgentStatus />}>{children}</AppShell>
    </Toaster>
  )
}
