"use client"

import { useTheme } from "@/components/shell/use-theme"
import { designTokens } from "@/lib/design-tokens"
import { cn } from "@roomer/ui/lib/utils"

import { Specimen } from "./section"

type PaletteKey = keyof typeof designTokens.light

const GROUPS: {
  title: string
  swatches: { key: PaletteKey; name: string; className: string }[]
}[] = [
  {
    title: "Paper & ink",
    swatches: [
      { key: "paper", name: "Paper", className: "bg-paper" },
      { key: "surface", name: "Surface", className: "bg-surface" },
      { key: "sunken", name: "Oat", className: "bg-sunken" },
      { key: "hairline", name: "Hairline", className: "bg-hairline" },
      { key: "rule", name: "Rule", className: "bg-rule" },
      { key: "faint", name: "Faint", className: "bg-faint" },
      { key: "muted", name: "Muted ink", className: "bg-muted-foreground" },
      { key: "inkSoft", name: "Soft ink", className: "bg-ink-soft" },
      { key: "ink", name: "Ink", className: "bg-ink" },
    ],
  },
  {
    title: "Clay, oak & sage",
    swatches: [
      { key: "clay", name: "Clay", className: "bg-clay" },
      { key: "clayFill", name: "Clay fill", className: "bg-clay-fill" },
      { key: "clayTint", name: "Clay tint", className: "bg-clay-tint" },
      { key: "oak", name: "Oak", className: "bg-oak" },
      { key: "oakFill", name: "Oak fill", className: "bg-oak-fill" },
      { key: "oakTint", name: "Oak tint", className: "bg-oak-tint" },
      { key: "sage", name: "Sage", className: "bg-sage" },
      { key: "sageFill", name: "Sage fill", className: "bg-sage-fill" },
      { key: "sageTint", name: "Sage tint", className: "bg-sage-tint" },
    ],
  },
  {
    title: "Lint severities",
    swatches: [
      { key: "error", name: "Brick", className: "bg-error" },
      { key: "errorFill", name: "Brick mark", className: "bg-error-fill" },
      { key: "errorTint", name: "Brick tint", className: "bg-error-tint" },
      { key: "warning", name: "Ochre", className: "bg-warning" },
      { key: "warningFill", name: "Ochre mark", className: "bg-warning-fill" },
      { key: "warningTint", name: "Ochre tint", className: "bg-warning-tint" },
      { key: "info", name: "Slate", className: "bg-info" },
      { key: "infoFill", name: "Slate mark", className: "bg-info-fill" },
      { key: "infoTint", name: "Slate tint", className: "bg-info-tint" },
    ],
  },
]

export function Palette() {
  const { theme } = useTheme()
  const tokens = designTokens[theme === "dark" ? "dark" : "light"]
  return (
    <div className="flex flex-col gap-8">
      {GROUPS.map((group) => (
        <Specimen key={group.title} label={group.title} framed={false}>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-x-3 gap-y-4">
            {group.swatches.map((swatch) => (
              <li key={swatch.key} className="flex flex-col gap-2">
                <span
                  className={cn(
                    "h-14 rounded-md border border-black/5 dark:border-white/5",
                    swatch.className
                  )}
                />
                <span className="flex flex-col">
                  <span className="text-xs font-medium text-foreground">
                    {swatch.name}
                  </span>
                  <span
                    className="font-mono text-2xs text-muted-foreground uppercase"
                    suppressHydrationWarning
                  >
                    {tokens[swatch.key]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Specimen>
      ))}
    </div>
  )
}

export function TypeScale() {
  return (
    <div className="grid gap-8 min-[1100px]:grid-cols-[1.3fr_1fr]">
      <Specimen label="Display" note="Newsreader · soft serif, optical sizes">
        <div className="flex flex-col gap-4 p-6">
          <p className="font-display text-[2.75rem] leading-[1.05] tracking-[-0.025em]">
            A calm studio for rooms
          </p>
          <p className="font-display text-[1.75rem] leading-tight tracking-[-0.02em]">
            Sofa facing the window
          </p>
          <p className="font-display text-xl leading-snug">
            Harper Dining Table, chestnut oak
          </p>
          <p className="font-display text-[0.9375rem] leading-snug text-ink-soft italic">
            Move Albie coffee table 125 mm towards W2.
          </p>
        </div>
      </Specimen>
      <div className="flex flex-col gap-8">
        <Specimen label="Interface" note="Albert Sans · Scandinavian grotesk">
          <div className="flex flex-col gap-3 p-6">
            <p className="text-[0.9375rem] font-medium">
              Every change is checked by the linter.
            </p>
            <p className="text-ui text-ink-soft">
              Things overlapping, a blocked door, a sofa in front of a radiator
              — reported in plain English, with numbers.
            </p>
            <p className="eyebrow">Small caps label · 11 / 0.08em</p>
          </div>
        </Specimen>
        <Specimen label="Readouts" note="Fragment Mono · codes and figures">
          <div className="flex flex-col gap-2 p-6 font-mono text-xs text-ink-soft">
            <p>E001 · W101 · I203</p>
            <p className="tabular-nums">2,980 × 7,690 mm · r14</p>
          </div>
        </Specimen>
      </div>
    </div>
  )
}

export function ShapeAndDepth() {
  const radii = [
    { name: "xs", value: "2px", className: "rounded-xs" },
    { name: "sm", value: "4px", className: "rounded-sm" },
    { name: "md", value: "6px", className: "rounded-md" },
    { name: "lg", value: "8px", className: "rounded-lg" },
    { name: "xl", value: "12px", className: "rounded-xl" },
    { name: "full", value: "pill", className: "rounded-full" },
  ]
  const shadows = [
    { name: "hairline", className: "shadow-hairline" },
    { name: "soft", className: "shadow-soft" },
    { name: "float", className: "shadow-float" },
    { name: "pop", className: "shadow-pop" },
  ]
  return (
    <div className="grid gap-8 min-[1100px]:grid-cols-2">
      <Specimen label="Radii" note="small and soft" framed={false}>
        <div className="flex flex-wrap items-end gap-4">
          {radii.map((r) => (
            <div key={r.name} className="flex flex-col items-center gap-2">
              <span
                className={cn(
                  "size-14 border border-rule bg-card",
                  r.className
                )}
              />
              <span className="font-mono text-2xs text-muted-foreground">
                {r.name} · {r.value}
              </span>
            </div>
          ))}
        </div>
      </Specimen>
      <Specimen label="Elevation" note="barely there" framed={false}>
        <div className="flex flex-wrap items-end gap-5 rounded-lg bg-sunken/60 p-5">
          {shadows.map((s) => (
            <div key={s.name} className="flex flex-col items-center gap-2">
              <span className={cn("size-14 rounded-md bg-card", s.className)} />
              <span className="font-mono text-2xs text-muted-foreground">
                {s.name}
              </span>
            </div>
          ))}
        </div>
      </Specimen>
    </div>
  )
}
