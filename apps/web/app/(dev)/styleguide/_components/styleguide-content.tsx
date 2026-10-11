"use client"

import { useState } from "react"

import { AgentStatus } from "@/components/shell/agent-status"
import { AppShell } from "@/components/shell/app-shell"

import {
  ActivityDemo,
  CommonDemo,
  IssuesDemo,
  ItemsDemo,
  LayoutsDemo,
  LibraryDemo,
  RendersDemo,
} from "./component-demos"
import { Palette, ShapeAndDepth, TypeScale } from "./foundations"
import { PrimitivesDemo } from "./primitives-demo"
import { Section } from "./section"
import { WorkspaceDemo } from "./workspace-demo"

const SECTIONS = [
  ["workspace", "Workspace"],
  ["foundations", "Foundations"],
  ["primitives", "Primitives"],
  ["common", "Common"],
  ["layouts", "Layouts"],
  ["issues", "Issues"],
  ["items", "Items"],
  ["activity", "Activity"],
  ["renders", "Renders"],
  ["library", "Library"],
] as const

/**
 * Every Roomer component on one page, fed with fixture data (the living room
 * and real Castlery products). The reference for how things should look, in
 * both themes.
 */
export function StyleguideContent() {
  // Pretend the agent touched something 20 seconds before the page opened.
  const [agentAt] = useState(() => Date.now() - 20_000)
  return (
    <AppShell
      context={<span className="text-ink-soft">Styleguide</span>}
      status={<AgentStatus lastActivityAt={agentAt} />}
    >
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-16 px-8 pt-14 pb-24">
        <header className="flex flex-col gap-8 motion-safe:animate-rise">
          <div className="flex flex-col gap-4">
            <span className="eyebrow">Design language · v1</span>
            <h1 className="max-w-[18ch] font-display text-[3.25rem] leading-[1.02] font-normal tracking-[-0.03em] text-foreground">
              A calm studio for rooms<span className="text-clay-fill">.</span>
            </h1>
            <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
              Warm paper and ink, hairline rules and generous space, with a
              single clay accent — in the spirit of chalk boucl&eacute; against
              chestnut oak. Numbers are typeset like a drawing&apos;s title
              block, and lint speaks in brick, ochre and slate.
            </p>
          </div>
          <nav
            aria-label="Sections"
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            {SECTIONS.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-ui text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        <Section
          id="workspace"
          index={1}
          stacked
          title="Workspace"
          description="Layouts · stage · inspector. Rails collapse with [ and ], and become sheets below 1100px. Hover an issue to highlight its items."
        >
          <WorkspaceDemo />
        </Section>

        <Section
          id="foundations"
          index={2}
          title="Foundations"
          description="Layered neutrals, one clay accent, oak as the quiet second voice, and muted, AA-legible severities."
        >
          <Palette />
          <TypeScale />
          <ShapeAndDepth />
        </Section>

        <Section
          id="primitives"
          index={3}
          title="Primitives"
          description="shadcn/Radix primitives in @roomer/ui, restyled — same APIs."
        >
          <PrimitivesDemo />
        </Section>

        <Section
          id="common"
          index={4}
          title="Common"
          description="Measurements, prices, times and marks — formatted one way everywhere."
        >
          <CommonDemo />
        </Section>

        <Section
          id="layouts"
          index={5}
          title="Layouts"
          description="The left rail. Status, lint tally, revision and a live dot while the agent works."
        >
          <LayoutsDemo />
        </Section>

        <Section
          id="issues"
          index={6}
          title="Issues"
          description="Grouped by severity; the hint reads like a margin note."
        >
          <IssuesDemo />
        </Section>

        <Section
          id="items"
          index={7}
          title="Items"
          description="What's in the layout, where it sits and what it costs."
        >
          <ItemsDemo />
        </Section>

        <Section
          id="activity"
          index={8}
          title="Activity"
          description="Who changed what, and how the lint moved."
        >
          <ActivityDemo />
        </Section>

        <Section
          id="renders"
          index={9}
          title="Renders"
          description="Photoreal renders with the clay and id passes they were painted from."
        >
          <RendersDemo />
        </Section>

        <Section
          id="library"
          index={10}
          title="Library"
          description="Products on a plinth: cutouts multiply into a warm ground."
        >
          <LibraryDemo />
        </Section>
      </div>
    </AppShell>
  )
}
