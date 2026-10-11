"use client"

import type { RenderPass } from "@roomer/core"
import dynamic from "next/dynamic"
import { useMemo, useState } from "react"

import { buildFixtureScene, FIXTURE_CAMERAS } from "@/lib/scene/fixture-scene"
import type { CameraView } from "@/lib/scene/types"

const RoomViewer = dynamic(
  () => import("@/components/scene/room-viewer").then((m) => m.RoomViewer),
  { ssr: false }
)

const VIEWS = {
  orbit: { kind: "orbit" },
  top: { kind: "top" },
  "from hall": { kind: "camera", camera: FIXTURE_CAMERAS.fromHall },
  "from window": { kind: "camera", camera: FIXTURE_CAMERAS.fromWindow },
} as const satisfies Record<string, CameraView>

type ViewName = keyof typeof VIEWS

const PASSES = ["clay", "id", "depth"] as const satisfies readonly RenderPass[]

export function SceneSandbox() {
  const [viewName, setViewName] = useState<ViewName>("orbit")
  const [pass, setPass] = useState<RenderPass>("clay")
  const [selection, setSelection] = useState<string | null>(null)
  const scene = useMemo(
    () => buildFixtureScene({ view: VIEWS[viewName], pass }),
    [viewName, pass]
  )
  return (
    <main className="flex h-dvh flex-col bg-neutral-100 text-sm text-neutral-800">
      <header className="flex flex-wrap items-center gap-4 border-b border-black/10 px-4 py-2">
        <span className="font-medium">Scene sandbox</span>
        <fieldset className="flex gap-1" aria-label="View">
          {(Object.keys(VIEWS) as ViewName[]).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={viewName === name}
              onClick={() => setViewName(name)}
              className="rounded-sm border border-black/10 px-2 py-0.5 aria-pressed:bg-neutral-800 aria-pressed:text-white"
            >
              {name}
            </button>
          ))}
        </fieldset>
        <fieldset className="flex gap-1" aria-label="Pass">
          {PASSES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={pass === name}
              onClick={() => setPass(name)}
              className="rounded-sm border border-black/10 px-2 py-0.5 aria-pressed:bg-neutral-800 aria-pressed:text-white"
            >
              {name}
            </button>
          ))}
        </fieldset>
        <span data-selection className="text-neutral-500">
          {selection ? `Selected: ${selection}` : "Click an item to select it"}
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <RoomViewer
          key={`${viewName}:${pass}`}
          scene={scene}
          selection={selection ? [selection] : []}
          onSelectionChange={setSelection}
        />
      </div>
    </main>
  )
}
