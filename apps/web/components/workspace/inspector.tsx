"use client"

import type { LintCounts } from "@roomer/core/schema"
import { ScrollArea } from "@roomer/ui/components/scroll-area"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@roomer/ui/components/tabs"
import { cn } from "@roomer/ui/lib/utils"

import { SeverityIcon } from "@/components/common/severity-icon"
import { totalIssues, worstSeverity } from "@/lib/format/lint"

export const INSPECTOR_TABS = [
  { value: "issues", label: "Issues" },
  { value: "items", label: "Items" },
  { value: "activity", label: "Activity" },
  { value: "renders", label: "Renders" },
] as const

export type InspectorTab = (typeof INSPECTOR_TABS)[number]["value"]

export interface InspectorCounts {
  issues?: LintCounts
  items?: number
  activity?: number
  renders?: number
}

/**
 * The right rail: Issues · Items · Activity · Renders, each a slot. Tab
 * labels carry quiet counts; the issues count wears the worst severity's
 * mark so a glance says whether the layout is sound.
 */
export function Inspector({
  value,
  defaultValue = "issues",
  onValueChange,
  counts = {},
  issues,
  items,
  activity,
  renders,
  className,
}: {
  value?: InspectorTab
  defaultValue?: InspectorTab
  onValueChange?: (tab: InspectorTab) => void
  counts?: InspectorCounts
  issues: React.ReactNode
  items: React.ReactNode
  activity: React.ReactNode
  renders: React.ReactNode
  className?: string
}) {
  const panels: Record<InspectorTab, React.ReactNode> = {
    issues,
    items,
    activity,
    renders,
  }
  const worst = counts.issues ? worstSeverity(counts.issues) : null

  return (
    <Tabs
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      onValueChange={(next) => {
        const tab = INSPECTOR_TABS.find((t) => t.value === next)
        if (tab) onValueChange?.(tab.value)
      }}
      className={cn("flex h-full min-h-0 flex-col gap-0", className)}
    >
      <div className="shrink-0 px-4 in-data-[slot=sheet-content]:pr-12">
        <TabsList variant="line" className="w-full justify-start">
          {INSPECTOR_TABS.map((tab) => {
            const count =
              tab.value === "issues"
                ? counts.issues
                  ? totalIssues(counts.issues)
                  : undefined
                : counts[tab.value]
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {count !== undefined ? (
                  <span className="inline-flex items-center gap-1 font-mono text-2xs font-normal text-muted-foreground tabular-nums">
                    {tab.value === "issues" && worst ? (
                      <SeverityIcon severity={worst} size={7} label={false} />
                    ) : null}
                    {count}
                  </span>
                ) : null}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </div>
      {INSPECTOR_TABS.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          className="min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">{panels[tab.value]}</ScrollArea>
        </TabsContent>
      ))}
    </Tabs>
  )
}
