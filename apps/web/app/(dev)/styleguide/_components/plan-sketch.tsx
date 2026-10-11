"use client"

import type { Vec2 } from "@roomer/core/schema"

import { useTheme } from "@/components/shell/use-theme"
import { designTokens } from "@/lib/design-tokens"

import { ITEMS } from "./fixtures"

// A hand-drawn stand-in for the real plan renderer (core `planSvg`, owned
// elsewhere): enough of the living room to judge the stage, the plan
// palette and the selection/issue treatments.

const WALL = 110

export function PlanSketch({
  corners,
  selectedId,
  highlightIds = [],
}: {
  corners: readonly Vec2[]
  selectedId?: string
  highlightIds?: readonly string[]
}) {
  const { theme } = useTheme()
  const p = designTokens.plan[theme === "dark" ? "dark" : "light"]
  const outline = corners.map(([x, z]) => `${x},${z}`).join(" ")
  const pad = 900

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${2980 + pad * 2} ${7690 + pad * 2}`}
      className="size-full"
      role="img"
      aria-label="Floor plan sketch of the living room"
    >
      {/* walls: a thick stroke, then the floor drawn over its inner half */}
      <polygon
        points={outline}
        fill={p.wallFill}
        stroke={p.wallFill}
        strokeWidth={WALL * 2}
        strokeLinejoin="miter"
      />
      <polygon points={outline} fill={p.floor} />

      {/* D1 kitchen door (W1, swings out into the kitchen) */}
      <rect
        x={1150}
        y={-WALL - 5}
        width={800}
        height={WALL + 10}
        fill={p.paper}
      />
      <line
        x1={1950}
        y1={0}
        x2={1950}
        y2={-800}
        stroke={p.door}
        strokeWidth={22}
      />
      <path
        d="M1150 0 A800 800 0 0 1 1950 -800"
        fill="none"
        stroke={p.doorSwing}
        strokeWidth={14}
        strokeDasharray="40 40"
      />

      {/* D2 hall door (W2, swings in) */}
      <rect x={2975} y={5250} width={WALL + 10} height={760} fill={p.paper} />
      <line
        x1={2980}
        y1={6010}
        x2={2220}
        y2={6010}
        stroke={p.door}
        strokeWidth={22}
      />
      <path
        d="M2980 5250 A760 760 0 0 0 2220 6010"
        fill="none"
        stroke={p.doorSwing}
        strokeWidth={14}
        strokeDasharray="40 40"
      />

      {/* WIN1 on W5 */}
      <rect
        x={120}
        y={7685}
        width={1930}
        height={WALL + 10}
        fill={p.windowGlass}
      />
      <line
        x1={120}
        y1={7690 + WALL / 2}
        x2={2050}
        y2={7690 + WALL / 2}
        stroke={p.window}
        strokeWidth={14}
      />

      {/* OB1 pier and RAD1 radiator */}
      <rect
        x={0}
        y={1770}
        width={120}
        height={1000}
        fill={p.featureFill}
        stroke={p.featureStroke}
        strokeWidth={10}
      />
      <rect
        x={385}
        y={7580}
        width={1400}
        height={110}
        fill={p.featureFill}
        stroke={p.featureStroke}
        strokeWidth={10}
      />

      {/* furniture */}
      {ITEMS.filter((item) => item.placement.elevation === 0).map((item) => {
        const { placement, asset } = item
        const rug = asset.category === "rug"
        const round =
          asset.name.includes("Round") ||
          asset.name.includes("Swivel") ||
          asset.name.includes("Lamp")
        const selected = placement.id === selectedId
        const flagged = highlightIds.includes(placement.id)
        const { w, d } = asset.dims
        return (
          <g
            key={placement.id}
            transform={`translate(${placement.x} ${placement.z}) rotate(${placement.facing - 180})`}
          >
            <rect
              x={-w / 2}
              y={-d / 2}
              width={w}
              height={d}
              rx={round ? Math.min(w, d) / 2 : rug ? 0 : 60}
              fill={
                selected
                  ? p.furnitureSelectedFill
                  : rug
                    ? p.rugFill
                    : p.furnitureFill
              }
              stroke={
                flagged
                  ? p.errorOutline
                  : selected
                    ? p.furnitureSelectedStroke
                    : rug
                      ? p.rugStroke
                      : p.furnitureStroke
              }
              strokeWidth={flagged || selected ? 26 : 12}
              strokeDasharray={rug ? "60 40" : undefined}
            />
            {!rug ? (
              <line
                x1={-w / 2 + 80}
                y1={d / 2 - 70}
                x2={w / 2 - 80}
                y2={d / 2 - 70}
                stroke={p.furnitureStroke}
                strokeWidth={8}
                opacity={0.6}
              />
            ) : null}
          </g>
        )
      })}

      {/* overlap wash for the selected issue */}
      {highlightIds.length > 0 ? (
        <rect
          x={1558}
          y={4810}
          width={120}
          height={980}
          fill={p.errorOutline}
          opacity={p.issueWashOpacity * 3}
        />
      ) : null}

      {/* pendants */}
      {[2400, 5600].map((z) => (
        <g key={z}>
          <circle
            cx={1490}
            cy={z}
            r={60}
            fill="none"
            stroke={p.labelMuted}
            strokeWidth={10}
          />
          <line
            x1={1440}
            y1={z}
            x2={1540}
            y2={z}
            stroke={p.labelMuted}
            strokeWidth={8}
          />
          <line
            x1={1490}
            y1={z - 50}
            x2={1490}
            y2={z + 50}
            stroke={p.labelMuted}
            strokeWidth={8}
          />
        </g>
      ))}

      {/* overall dimensions */}
      <g stroke={p.dimensionLine} strokeWidth={8}>
        <line x1={0} y1={-560} x2={2980} y2={-560} />
        <line x1={0} y1={-620} x2={0} y2={-500} />
        <line x1={2980} y1={-620} x2={2980} y2={-500} />
        <line x1={3460} y1={0} x2={3460} y2={7090} />
        <line x1={3400} y1={0} x2={3520} y2={0} />
        <line x1={3400} y1={7090} x2={3520} y2={7090} />
      </g>
      <text
        x={1490}
        y={-620}
        textAnchor="middle"
        fontSize={150}
        fill={p.dimensionText}
        fontFamily={designTokens.fonts.mono}
      >
        2,980
      </text>
      <text
        x={3560}
        y={3545}
        fontSize={150}
        fill={p.dimensionText}
        fontFamily={designTokens.fonts.mono}
        transform="rotate(90 3560 3545)"
        textAnchor="middle"
      >
        7,090
      </text>
    </svg>
  )
}
