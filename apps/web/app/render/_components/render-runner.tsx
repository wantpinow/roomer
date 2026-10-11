"use client"

import { useEffect, useState } from "react"
import { z } from "zod"

import {
  type RenderAssetScene,
  type RenderScene,
  zRenderAssetScene,
  zRenderScene,
} from "@/lib/scene/types"

import { type RenderJob, RenderJobView } from "./render-job"

type Request =
  | { kind: "room"; scene: RenderScene }
  | { kind: "asset"; scene: RenderAssetScene }

/** Parses what the caller sent; a readable error when it's malformed. */
function parse(kind: Request["kind"], input: unknown): Request {
  const fail = (error: z.ZodError): never => {
    throw new Error(`Invalid ${kind} scene:\n${z.prettifyError(error)}`)
  }
  if (kind === "room") {
    const result = zRenderScene.safeParse(input)
    return result.success ? { kind, scene: result.data } : fail(result.error)
  }
  const result = zRenderAssetScene.safeParse(input)
  return result.success ? { kind, scene: result.data } : fail(result.error)
}

/**
 * Owns `window.roomer`. Requests run one at a time (each mounts a fresh
 * canvas, renders until settled, captures a PNG and unmounts), so callers
 * may fire several without waiting.
 */
export function RenderRunner() {
  const [job, setJob] = useState<RenderJob | null>(null)

  useEffect(() => {
    let queue: Promise<unknown> = Promise.resolve()
    let sequence = 0
    const run = (kind: Request["kind"], input: unknown): Promise<string> => {
      const result = queue.then(
        () =>
          new Promise<string>((resolve, reject) => {
            const request = parse(kind, input)
            setJob({
              id: ++sequence,
              ...request,
              resolve: (url) => {
                setJob(null)
                resolve(url)
              },
              reject: (error) => {
                setJob(null)
                reject(error)
              },
            })
          })
      )
      queue = result.catch(() => undefined)
      return result
    }
    window.roomer = {
      ready: true,
      render: (scene) => run("room", scene),
      renderAsset: (scene) => run("asset", scene),
    }
    return () => {
      delete window.roomer
    }
  }, [])

  return (
    <main
      data-render-state={job ? "rendering" : "idle"}
      className="fixed inset-0 overflow-hidden bg-white"
    >
      {job ? <RenderJobView key={job.id} job={job} /> : null}
    </main>
  )
}
