"use client"

import { useState } from "react"

import { ActivityFeed } from "@/components/activity/activity-feed"
import { ActorAvatar } from "@/components/activity/actor-avatar"
import { Dimension, Dims } from "@/components/common/dimension"
import { LintCounts } from "@/components/common/lint-counts"
import { Price } from "@/components/common/price"
import { RelativeTime } from "@/components/common/relative-time"
import { RoomStats } from "@/components/common/room-stats"
import { SeverityIcon } from "@/components/common/severity-icon"
import { IssueList } from "@/components/issues/issue-list"
import { ItemList } from "@/components/items/item-list"
import { LayoutList } from "@/components/layouts/layout-list"
import { LayoutStatusChip } from "@/components/layouts/layout-status-chip"
import { AssetDetail } from "@/components/library/asset-detail"
import { AssetGrid } from "@/components/library/asset-grid"
import { RenderGallery } from "@/components/renders/render-gallery"

import {
  EVENTS,
  FIXTURE_NOW,
  ISSUES,
  ITEMS,
  LABELS,
  LAYOUTS,
  LIBRARY,
  RENDERS,
  ROOM,
} from "./fixtures"
import { Specimen } from "./section"

const RAIL = 264
const INSPECTOR = 340

export function CommonDemo() {
  return (
    <div className="grid gap-8 min-[1100px]:grid-cols-2">
      <Specimen label="Lengths, sizes & prices" framed={false}>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-ui">
          <dt className="text-muted-foreground">Dimension</dt>
          <dd>
            <Dimension mm={2980} />
          </dd>
          <dt className="text-muted-foreground">In metres</dt>
          <dd>
            <Dimension mm={2980} unit="m" />
          </dd>
          <dt className="text-muted-foreground">W × D × H</dt>
          <dd>
            <Dims dims={{ w: 2310, d: 915, h: 765 }} />
          </dd>
          <dt className="text-muted-foreground">Price</dt>
          <dd className="flex gap-4">
            <Price amount={1698} />
            <Price amount={1698.5} />
            <Price amount={undefined} />
          </dd>
          <dt className="text-muted-foreground">Relative time</dt>
          <dd className="flex gap-4 text-ink-soft">
            <RelativeTime at={FIXTURE_NOW - 20_000} now={FIXTURE_NOW} />
            <RelativeTime at={FIXTURE_NOW - 3_600_000 * 3} now={FIXTURE_NOW} />
            <RelativeTime
              at={FIXTURE_NOW - 86_400_000 * 40}
              now={FIXTURE_NOW}
            />
          </dd>
        </dl>
      </Specimen>
      <Specimen label="Severity, status & actors" framed={false}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 text-ui text-ink-soft">
            <span className="flex items-center gap-1.5">
              <SeverityIcon severity="error" /> Error
            </span>
            <span className="flex items-center gap-1.5">
              <SeverityIcon severity="warning" /> Warning
            </span>
            <span className="flex items-center gap-1.5">
              <SeverityIcon severity="info" /> Note
            </span>
            <LintCounts counts={{ error: 0, warning: 2, info: 1 }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LayoutStatusChip status="draft" />
            <LayoutStatusChip status="candidate" />
            <LayoutStatusChip status="favourite" />
            <LayoutStatusChip status="archived" />
          </div>
          <div className="flex items-center gap-2">
            <ActorAvatar actor="agent" />
            <ActorAvatar actor="user" />
            <ActorAvatar actor="system" />
          </div>
        </div>
      </Specimen>
      <Specimen label="Room stats" className="col-span-full">
        <div className="p-5">
          <RoomStats stats={ROOM.stats} />
        </div>
      </Specimen>
    </div>
  )
}

export function LayoutsDemo() {
  const [selected, setSelected] = useState("sofa-facing-window")
  return (
    <div className="flex flex-wrap gap-6">
      <Specimen label="Loaded" width={RAIL}>
        <LayoutList
          layouts={LAYOUTS}
          selectedId={selected}
          onSelect={setSelected}
          now={FIXTURE_NOW}
        />
      </Specimen>
      <Specimen label="Loading" width={RAIL}>
        <LayoutList layouts={undefined} />
      </Specimen>
      <Specimen label="Empty" width={RAIL}>
        <LayoutList layouts={[]} />
      </Specimen>
    </div>
  )
}

export function IssuesDemo() {
  return (
    <div className="flex flex-wrap gap-6">
      <Specimen label="Grouped by severity" width={INSPECTOR}>
        <IssueList issues={ISSUES} labels={LABELS} />
      </Specimen>
      <div className="flex flex-col gap-6">
        <Specimen label="All clear" width={INSPECTOR}>
          <IssueList issues={[]} />
        </Specimen>
        <Specimen label="Loading" width={INSPECTOR}>
          <IssueList issues={undefined} />
        </Specimen>
      </div>
    </div>
  )
}

export function ItemsDemo() {
  return (
    <div className="flex flex-wrap gap-6">
      <Specimen label="Placed items" note="with total" width={INSPECTOR}>
        <div className="max-h-[560px] overflow-auto">
          <ItemList
            items={ITEMS}
            selectedIds={["sofa", "coffee-table", "armchair"]}
            onClearSelection={() => undefined}
          />
        </div>
      </Specimen>
      <div className="flex flex-col gap-6">
        <Specimen label="Empty" width={INSPECTOR}>
          <ItemList items={[]} />
        </Specimen>
        <Specimen label="Loading" width={INSPECTOR}>
          <ItemList items={undefined} />
        </Specimen>
      </div>
    </div>
  )
}

export function ActivityDemo() {
  return (
    <div className="flex flex-wrap gap-6">
      <Specimen label="Feed" width={INSPECTOR}>
        <ActivityFeed events={EVENTS} now={FIXTURE_NOW} />
      </Specimen>
      <div className="flex flex-col gap-6">
        <Specimen label="Empty" width={INSPECTOR}>
          <ActivityFeed events={[]} />
        </Specimen>
        <Specimen label="Loading" width={INSPECTOR}>
          <ActivityFeed events={undefined} />
        </Specimen>
      </div>
    </div>
  )
}

export function RendersDemo() {
  return (
    <div className="flex flex-col gap-8">
      <Specimen label="Gallery" note="pending · done · failed — click to open">
        <RenderGallery renders={RENDERS} now={FIXTURE_NOW} />
      </Specimen>
      <div className="flex flex-wrap gap-6">
        <Specimen label="In the inspector" width={INSPECTOR}>
          <RenderGallery renders={RENDERS.slice(1, 2)} now={FIXTURE_NOW} />
        </Specimen>
        <Specimen label="Empty" width={INSPECTOR}>
          <RenderGallery renders={[]} />
        </Specimen>
        <Specimen label="Loading" width={INSPECTOR}>
          <RenderGallery renders={undefined} />
        </Specimen>
      </div>
    </div>
  )
}

export function LibraryDemo() {
  const [selected, setSelected] = useState<string>(LIBRARY[0]?.id ?? "")
  const asset = LIBRARY.find((a) => a.id === selected)
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
        <Specimen label="Grid" framed={false}>
          <AssetGrid
            assets={LIBRARY.slice(0, 9)}
            selectedId={selected}
            onSelect={setSelected}
          />
        </Specimen>
        <Specimen label="Detail panel" framed={false}>
          <div className="rounded-lg border border-border bg-card p-5 shadow-hairline">
            <AssetDetail asset={asset} />
          </div>
        </Specimen>
      </div>
      <div className="grid gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
        <Specimen label="Loading" framed={false}>
          <AssetGrid assets={undefined} className="max-h-72 overflow-hidden" />
        </Specimen>
        <Specimen label="Empty">
          <AssetGrid assets={[]} />
        </Specimen>
      </div>
    </div>
  )
}
