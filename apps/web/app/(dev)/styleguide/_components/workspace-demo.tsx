"use client"

import { PlusIcon } from "lucide-react"
import { useState } from "react"

import type { LintIssue } from "@roomer/core/schema"
import { Button } from "@roomer/ui/components/button"

import { ActivityFeed } from "@/components/activity/activity-feed"
import { LintCounts } from "@/components/common/lint-counts"
import { SeverityIcon } from "@/components/common/severity-icon"
import { issueKey } from "@/components/issues/issue-row"
import { IssueList } from "@/components/issues/issue-list"
import { ItemList } from "@/components/items/item-list"
import { LayoutActionsMenu } from "@/components/layouts/layout-actions-menu"
import { LayoutList } from "@/components/layouts/layout-list"
import { RenderGallery } from "@/components/renders/render-gallery"
import { Inspector } from "@/components/workspace/inspector"
import { RailPanel } from "@/components/workspace/rail-panel"
import { FloatingBar, Stage } from "@/components/workspace/stage"
import { StageCaption } from "@/components/workspace/stage-caption"
import {
  ViewModeControl,
  type ViewMode,
} from "@/components/workspace/view-mode-control"
import { WorkspaceFrame } from "@/components/workspace/workspace-frame"
import { ZoomControls } from "@/components/workspace/zoom-controls"

import {
  EVENTS,
  FIXTURE_NOW,
  ISSUES,
  ITEMS,
  LABELS,
  LAYOUTS,
  LINT_COUNTS,
  RENDERS,
  ROOM,
} from "./fixtures"
import { PlanSketch } from "./plan-sketch"

/** The whole workspace, wired to fixtures, at a realistic size. */
export function WorkspaceDemo() {
  const [layoutId, setLayoutId] = useState("chaise-by-the-pier")
  const [mode, setMode] = useState<ViewMode>("plan")
  const [zoom, setZoom] = useState(1)
  const [selectedIssue, setSelectedIssue] = useState<LintIssue | null>(
    ISSUES[0] ?? null
  )
  const [hovered, setHovered] = useState<string[]>([])
  const [selectedItem, setSelectedItem] = useState<string | undefined>()
  const layout = LAYOUTS.find((l) => l.id === layoutId) ?? LAYOUTS[0]
  const highlight =
    hovered.length > 0 ? hovered : (selectedIssue?.placementIds ?? [])

  return (
    <div className="h-[760px] overflow-hidden rounded-xl border border-border bg-background shadow-soft">
      <WorkspaceFrame
        rail={
          <RailPanel
            title="Layouts"
            count={LAYOUTS.length}
            actions={
              <Button variant="ghost" size="icon-xs" aria-label="New layout">
                <PlusIcon />
              </Button>
            }
          >
            <LayoutList
              layouts={LAYOUTS}
              selectedId={layoutId}
              onSelect={setLayoutId}
              now={FIXTURE_NOW}
              renderActions={(l) => (
                <LayoutActionsMenu
                  layoutName={l.name}
                  status={l.status}
                  onRename={() => undefined}
                  onDuplicate={() => undefined}
                  onSetStatus={() => undefined}
                />
              )}
            />
          </RailPanel>
        }
        stage={
          <Stage
            toolbar={<ViewModeControl value={mode} onValueChange={setMode} />}
            controls={
              <ZoomControls
                zoom={zoom}
                onZoomIn={() => setZoom((z) => Math.min(4, z * 1.25))}
                onZoomOut={() => setZoom((z) => Math.max(0.25, z / 1.25))}
                onFit={() => setZoom(1)}
              />
            }
            overlay={
              selectedIssue ? (
                <FloatingBar className="gap-2 rounded-md py-1.5 pr-3 pl-2.5 text-xs">
                  <SeverityIcon severity={selectedIssue.severity} />
                  <span className="font-mono text-2xs text-muted-foreground">
                    {selectedIssue.code}
                  </span>
                  <span className="truncate text-ink-soft">
                    {LABELS[selectedIssue.placementIds[0] ?? ""]} ×{" "}
                    {LABELS[selectedIssue.placementIds[1] ?? ""] ?? "D2"}
                  </span>
                </FloatingBar>
              ) : null
            }
            caption={
              <StageCaption
                roomName={ROOM.name}
                layoutName={layout?.name}
                stats={ROOM.stats}
                trailing={
                  <>
                    <span className="font-mono tabular-nums">
                      r{layout?.revision}
                    </span>
                    {layout ? <LintCounts counts={layout.lintCounts} /> : null}
                  </>
                }
              />
            }
          >
            <div
              className="flex size-full items-center justify-center py-16 transition-transform duration-300"
              style={{ transform: `scale(${zoom})` }}
            >
              <PlanSketch
                corners={ROOM.corners}
                selectedId={selectedItem}
                highlightIds={highlight}
              />
            </div>
          </Stage>
        }
        inspector={
          <Inspector
            counts={{
              issues: LINT_COUNTS,
              items: ITEMS.length,
              activity: EVENTS.length,
              renders: RENDERS.length,
            }}
            issues={
              <IssueList
                issues={ISSUES}
                labels={LABELS}
                selectedKey={
                  selectedIssue ? issueKey(selectedIssue) : undefined
                }
                onSelect={(issue) =>
                  setSelectedIssue((current) =>
                    current && issueKey(current) === issueKey(issue)
                      ? null
                      : issue
                  )
                }
                onHover={setHovered}
              />
            }
            items={
              <ItemList
                items={ITEMS}
                selectedIds={selectedItem ? [selectedItem] : []}
                onSelect={(id) =>
                  setSelectedItem((current) =>
                    current === id ? undefined : id
                  )
                }
                onHover={(id) => setHovered(id ? [id] : [])}
              />
            }
            activity={<ActivityFeed events={EVENTS} now={FIXTURE_NOW} />}
            renders={<RenderGallery renders={RENDERS} now={FIXTURE_NOW} />}
          />
        }
      />
    </div>
  )
}
