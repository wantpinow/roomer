"use client"

import { useEffect, useMemo } from "react"

import type { SceneMaterials } from "@/lib/scene/materials"
import {
  SHELL_ROLES,
  type ShellRole,
  type ShellSolid,
} from "@/lib/scene/room-geometry"
import { mergedSolidGeometry } from "@/lib/scene/solid-geometry"

/** The room's fixed solids, merged into one mesh per role (one draw each). */
export function RoomShellMeshes({
  solids,
  materials,
  shadows,
}: {
  solids: readonly ShellSolid[]
  materials: SceneMaterials
  shadows: boolean
}) {
  const meshes = useMemo(() => {
    const out: {
      role: ShellRole
      geometry: NonNullable<ReturnType<typeof mergedSolidGeometry>>
    }[] = []
    for (const role of SHELL_ROLES) {
      const geometry = mergedSolidGeometry(
        solids.filter((s) => s.role === role)
      )
      if (geometry) out.push({ role, geometry })
    }
    return out
  }, [solids])
  useEffect(
    () => () => {
      for (const { geometry } of meshes) geometry.dispose()
    },
    [meshes]
  )
  return (
    <group name="shell">
      {meshes.map(({ role, geometry }) => (
        <mesh
          key={role}
          name={role}
          geometry={geometry}
          material={materials.shell(role)}
          // Glass lets the sun in; nothing shades it.
          castShadow={shadows && role !== "glass"}
          receiveShadow={shadows && role !== "glass"}
        />
      ))}
    </group>
  )
}
