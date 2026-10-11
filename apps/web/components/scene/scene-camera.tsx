"use client"

import { useThree } from "@react-three/fiber"
import { useLayoutEffect, useMemo } from "react"
import { OrthographicCamera, PerspectiveCamera } from "three"

import type { CameraSetup } from "@/lib/scene/views"

/**
 * Makes a camera from a `CameraSetup` (metres) and installs it as the
 * canvas's default. The frustum is set by hand (`manual`), so R3F doesn't
 * overwrite an orthographic fit on resize.
 */
export function SceneCamera({ setup }: { setup: CameraSetup }) {
  const set = useThree((state) => state.set)
  const aspect = useThree((state) => state.size.width / state.size.height)
  const camera = useMemo(() => {
    const cam =
      setup.kind === "perspective"
        ? new PerspectiveCamera(setup.fov, aspect, setup.near, setup.far)
        : new OrthographicCamera(
            -setup.halfWidth,
            setup.halfWidth,
            setup.halfHeight,
            -setup.halfHeight,
            setup.near,
            setup.far
          )
    cam.up.set(...setup.up)
    cam.position.set(...setup.position)
    cam.lookAt(...setup.target)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    return Object.assign(cam, { manual: true })
  }, [setup, aspect])
  useLayoutEffect(() => {
    set({ camera })
  }, [camera, set])
  return null
}
