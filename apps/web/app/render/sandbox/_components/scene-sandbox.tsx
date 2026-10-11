"use client"

import type { RenderPass } from "@roomer/core"
import dynamic from "next/dynamic"
import { useMemo, useState } from "react"

import { buildFixtureScene, FIXTURE_CAMERAS } from "@/lib/scene/fixture-scene"
import type { CameraView } from "@/lib/scene/types"
import type { WalkPhoto } from "@/lib/walk/photo"
import type { WalkBump } from "@/lib/walk/physics"

const RoomViewer = dynamic(
  () => import("@/components/scene/room-viewer").then((m) => m.RoomViewer),
  { ssr: false }
)

const WalkViewer = dynamic(
  () => import("@/components/scene/walk-viewer").then((m) => m.WalkViewer),
  { ssr: false }
)

const VIEWS = {
  orbit: { kind: "orbit" },
  top: { kind: "top" },
  "from door": { kind: "camera", camera: FIXTURE_CAMERAS.fromDoor },
  "from window": { kind: "camera", camera: FIXTURE_CAMERAS.fromWindow },
} as const satisfies Record<string, CameraView>

type ViewName = keyof typeof VIEWS | "walk"

const VIEW_NAMES: readonly ViewName[] = [
  ...(Object.keys(VIEWS) as (keyof typeof VIEWS)[]),
  "walk",
]

const PASSES = ["clay", "id", "depth"] as const satisfies readonly RenderPass[]

const buttonClass =
  "rounded-sm border border-black/10 px-2 py-0.5 aria-pressed:bg-neutral-800 aria-pressed:text-white disabled:opacity-40"

/** A stand-in "rendered photo" for the sandbox. */
function placeholderPhoto(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#e9e5df"/><text x="150" y="105" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#5c554c">${name}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function SceneSandbox() {
  const [viewName, setViewName] = useState<ViewName>("orbit")
  const [pass, setPass] = useState<RenderPass>("clay")
  const [selection, setSelection] = useState<string | null>(null)
  const [bumps, setBumps] = useState<WalkBump[]>([])
  // No backend here: photos "render" in a moment as a placeholder card, so
  // the walk's photo flow can be tried end to end.
  const [photos, setPhotos] = useState<WalkPhoto[]>([])
  const walking = viewName === "walk"
  const scene = useMemo(
    () =>
      buildFixtureScene({
        view: walking ? VIEWS.orbit : VIEWS[viewName],
        pass: walking ? "clay" : pass,
      }),
    [viewName, walking, pass]
  )
  const status = walking
    ? bumps[0]
      ? `Bumped into ${bumps[0].label} (${bumps.length} bump${bumps.length === 1 ? "" : "s"})`
      : "Click the view to walk"
    : selection
      ? `Selected: ${selection}`
      : "Click an item to select it"

  return (
    <main className="flex h-dvh flex-col bg-neutral-100 text-sm text-neutral-800">
      <header className="flex flex-wrap items-center gap-4 border-b border-black/10 px-4 py-2">
        <span className="font-medium">Scene sandbox</span>
        <fieldset className="flex gap-1" aria-label="View">
          {VIEW_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={viewName === name}
              onClick={() => setViewName(name)}
              className={buttonClass}
            >
              {name}
            </button>
          ))}
        </fieldset>
        <fieldset className="flex gap-1" aria-label="Pass" disabled={walking}>
          {PASSES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={pass === name}
              onClick={() => setPass(name)}
              className={buttonClass}
            >
              {name}
            </button>
          ))}
        </fieldset>
        <span data-sandbox-status className="text-neutral-500">
          {status}
        </span>
      </header>
      <div className="min-h-0 flex-1">
        {walking ? (
          <WalkViewer
            scene={scene}
            onBump={(bump) => setBumps((all) => [bump, ...all].slice(0, 50))}
            photos={photos}
            onPhoto={(camera) => {
              const id = camera.id
              setPhotos((all) => [{ id, status: "pending" }, ...all])
              setTimeout(() => {
                setPhotos((all) =>
                  all.map((p) =>
                    p.id === id
                      ? {
                          ...p,
                          status: "done",
                          url: placeholderPhoto(camera.name),
                        }
                      : p
                  )
                )
              }, 1500)
            }}
            onSaveView={(camera) => ({
              ok: true,
              message: `“${camera.name}” would be saved (sandbox)`,
            })}
          />
        ) : (
          <RoomViewer
            key={`${viewName}:${pass}`}
            scene={scene}
            selection={selection ? [selection] : []}
            onSelectionChange={setSelection}
          />
        )}
      </div>
    </main>
  )
}
