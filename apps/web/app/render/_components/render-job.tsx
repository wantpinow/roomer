"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import {
  Component,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
} from "react"

import { AssetPreviewScene } from "@/components/scene/asset-preview-scene"
import { passCanvasProps } from "@/components/scene/canvas-config"
import { RoomScene } from "@/components/scene/room-scene"
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

/** Counts drawn frames inside the canvas, then reads the drawing buffer. */
function CaptureWhenSettled({
  frames,
  onCapture,
}: {
  frames: number
  onCapture: (dataUrl: string) => void
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
      setTimeout(() => onCapture(gl.domElement.toDataURL("image/png")), 0)
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

/** One render: a canvas at exactly the requested pixel size. */
export function RenderJobView({ job }: { job: RenderJob }) {
  const { width, height } = job.scene
  const pass = job.kind === "room" ? job.scene.pass : "clay"
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
          {...passCanvasProps(pass, { preserveDrawingBuffer: true })}
          dpr={1}
          frameloop="always"
          resize={{ scroll: false, debounce: 0 }}
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          {job.kind === "room" ? (
            <RoomScene scene={job.scene} />
          ) : (
            <AssetPreviewScene asset={job.scene.asset} view={job.scene.view} />
          )}
          <CaptureWhenSettled
            frames={SETTLE_FRAMES}
            onCapture={(dataUrl) => finish({ dataUrl })}
          />
        </Canvas>
      </RenderErrorBoundary>
    </div>
  )
}
