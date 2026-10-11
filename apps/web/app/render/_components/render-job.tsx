"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import {
  Component,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
} from "react"
import { Color, type WebGLRenderer } from "three"

import { AssetPreviewScene } from "@/components/scene/asset-preview-scene"
import { passCanvasProps } from "@/components/scene/canvas-config"
import { remapToFisheye } from "@/components/scene/fisheye-remap"
import { RoomScene } from "@/components/scene/room-scene"
import { type FisheyePlan, planFisheye } from "@/lib/scene/fisheye"
import { exactColor } from "@/lib/scene/materials"
import { ID_PASS_BACKGROUND } from "@/lib/scene/palette"
import type { RenderAssetScene, RenderScene } from "@/lib/scene/types"

/** Frames drawn before capturing: lets shadows, AO and MSAA settle. */
export const SETTLE_FRAMES = 8
/** Give up on a render that never settles (WebGL hung, context lost). */
export const JOB_TIMEOUT_MS = 45_000

export type RenderJob = {
  id: number
  resolve: (dataUrl: string) => void
  reject: (error: Error) => void
} & (
  | { kind: "room"; scene: RenderScene }
  | { kind: "asset"; scene: RenderAssetScene }
)

/** Where a fisheye remap shows nothing (rays past the source's edge). */
const FISHEYE_BACKGROUND = {
  clay: new Color("#1d1b18"),
  id: exactColor(ID_PASS_BACKGROUND),
  depth: exactColor("#000000"),
} as const

/** The fisheye plan for a room render from a fisheye camera, else null. */
function fisheyePlanFor(job: RenderJob): FisheyePlan | null {
  if (job.kind !== "room") return null
  const { view, width, height } = job.scene
  if (view.kind !== "camera" || view.camera.projection !== "fisheye")
    return null
  return planFisheye(width, height, view.camera.fov)
}

/** Counts drawn frames inside the canvas, then reads the drawing buffer. */
function CaptureWhenSettled({
  frames,
  capture,
  onCapture,
  onError,
}: {
  frames: number
  capture: (gl: WebGLRenderer) => string
  onCapture: (dataUrl: string) => void
  onError: (error: Error) => void
}) {
  const gl = useThree((state) => state.gl)
  const drawn = useRef(0)
  const captured = useRef(false)
  useFrame(() => {
    if (captured.current) return
    drawn.current += 1
    if (drawn.current >= frames) {
      captured.current = true
      // After this frame's render: the buffer is preserved, so it's this frame.
      setTimeout(() => {
        try {
          onCapture(capture(gl))
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)))
        }
      }, 0)
    }
  })
  return null
}

class RenderErrorBoundary extends Component<
  { onError: (error: Error) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(
      error instanceof Error ? error : new Error(String(error))
    )
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * One render: a canvas at exactly the requested pixel size — or, for a
 * fisheye camera, at the size of the wide rectilinear source, remapped to
 * the requested size on capture.
 */
export function RenderJobView({ job }: { job: RenderJob }) {
  const pass = job.kind === "room" ? job.scene.pass : "clay"
  const fisheye = useMemo(() => fisheyePlanFor(job), [job])
  const width = fisheye?.sourceWidth ?? job.scene.width
  const height = fisheye?.sourceHeight ?? job.scene.height
  const roomScene = useMemo((): RenderScene | null => {
    if (job.kind !== "room") return null
    const { view } = job.scene
    if (!fisheye || view.kind !== "camera") return job.scene
    // Draw the wide rectilinear source; the remap makes it a fisheye.
    return {
      ...job.scene,
      view: {
        kind: "camera",
        camera: {
          ...view.camera,
          fov: fisheye.sourceFov,
          projection: "rectilinear",
        },
      },
    }
  }, [job, fisheye])
  const capture = (gl: WebGLRenderer): string =>
    fisheye
      ? remapToFisheye(gl, fisheye, {
          exact: pass !== "clay",
          background: FISHEYE_BACKGROUND[pass],
        })
      : gl.domElement.toDataURL("image/png")
  const settled = useRef(false)
  const finish = (outcome: { dataUrl: string } | { error: Error }) => {
    if (settled.current) return
    settled.current = true
    if ("dataUrl" in outcome) job.resolve(outcome.dataUrl)
    else job.reject(outcome.error)
  }
  const timeOut = useEffectEvent(() =>
    finish({
      error: new Error(`Render did not settle within ${JOB_TIMEOUT_MS} ms`),
    })
  )

  useEffect(() => {
    const timer = setTimeout(timeOut, JOB_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      data-render-job={job.id}
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      <RenderErrorBoundary onError={(error) => finish({ error })}>
        <Canvas
          {...passCanvasProps(pass, {
            preserveDrawingBuffer: true,
            antialias: !fisheye,
          })}
          dpr={1}
          frameloop="always"
          resize={{ scroll: false, debounce: 0 }}
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          {roomScene ? (
            <RoomScene
              scene={roomScene}
              {...(fisheye ? { multisampling: 0, radialDepth: true } : {})}
            />
          ) : job.kind === "asset" ? (
            <AssetPreviewScene asset={job.scene.asset} view={job.scene.view} />
          ) : null}
          <CaptureWhenSettled
            frames={SETTLE_FRAMES}
            capture={capture}
            onCapture={(dataUrl) => finish({ dataUrl })}
            onError={(error) => finish({ error })}
          />
        </Canvas>
      </RenderErrorBoundary>
    </div>
  )
}
