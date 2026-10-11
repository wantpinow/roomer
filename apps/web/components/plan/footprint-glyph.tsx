import { cn } from "@roomer/ui/lib/utils"

type Ring = readonly (readonly [number, number])[]

/**
 * An asset seen from above, as a tiny drawing: its plan outline (item-local
 * mm, front towards the bottom) with a short tick marking the front. For
 * pieces with no photo.
 */
export function FootprintGlyph({
  rings,
  className,
  title,
}: {
  rings: readonly Ring[]
  className?: string
  title?: string
}) {
  const points = rings.flat()
  if (points.length < 3) return null
  const xs = points.map(([x]) => x)
  const zs = points.map(([, z]) => z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const size = Math.max(maxX - minX, maxZ - minZ)
  const pad = size * 0.14
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const half = size / 2 + pad
  return (
    <svg
      viewBox={`${cx - half} ${cz - half} ${half * 2} ${half * 2}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("overflow-visible", className)}
    >
      {rings.map((ring, i) => (
        <polygon
          key={i}
          points={ring.map(([x, z]) => `${x},${z}`).join(" ")}
          className="fill-oak-tint stroke-oak-fill"
          strokeWidth={size * 0.025}
          strokeLinejoin="round"
        />
      ))}
      {/* the front (+z) */}
      <line
        x1={cx - size * 0.12}
        x2={cx + size * 0.12}
        y1={maxZ + pad * 0.45}
        y2={maxZ + pad * 0.45}
        className="stroke-clay-fill"
        strokeWidth={size * 0.035}
        strokeLinecap="round"
      />
    </svg>
  )
}
