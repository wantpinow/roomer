import { type AssetSpec, ID_PASS_PALETTE, type Placement } from "@roomer/core"

// Id pass bookkeeping, shared by the scene (which paints each placement its
// colour) and the photoreal pipeline (which tells the image model which
// colour is which item). Placement i gets palette entry i, wrapping after
// the palette's length — beyond that colours repeat, which the legend shows.

export interface IdPassColor {
  name: string
  hex: string
}

export function idPassColor(index: number): IdPassColor {
  const n = ID_PASS_PALETTE.length
  const entry = ID_PASS_PALETTE[((index % n) + n) % n]!
  return { name: entry.name, hex: entry.hex }
}

export interface IdPassLegendEntry {
  placementId: string
  assetId: string
  /** The placement's label, else the asset's name, else the placement id. */
  label: string
  /** The asset's name when known. */
  assetName?: string
  colorName: string
  hex: string
}

export function idPassLegend(
  placements: readonly Placement[],
  assets: Readonly<Record<string, AssetSpec>>
): IdPassLegendEntry[] {
  return placements.map((placement, index) => {
    const asset = assets[placement.assetId]
    const { name, hex } = idPassColor(index)
    return {
      placementId: placement.id,
      assetId: placement.assetId,
      label: placement.label?.trim() || asset?.name || placement.id,
      ...(asset ? { assetName: asset.name } : {}),
      colorName: name,
      hex,
    }
  })
}

/** "#e6194b" → [230, 25, 75]. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`)
  const value = Number.parseInt(match[1]!, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}
