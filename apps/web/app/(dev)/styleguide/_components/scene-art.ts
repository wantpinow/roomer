import { ID_PASS_PALETTE } from "@roomer/core/schema"

import { designTokens } from "@/lib/design-tokens"

// Stand-ins for the clay and id passes, drawn as SVG so the styleguide can
// show render cards and the compare slider without a running renderer.

type Pass = "clay" | "id"

function svg(body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024">${body}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`
}

const id = (i: number) => ID_PASS_PALETTE[i]?.hex ?? "#000000"

/** A three-quarter view of a living room: back wall, window, sofa, table, chair. */
export function sceneArt(pass: Pass): string {
  const s = designTokens.scene
  const clay = pass === "clay"
  const shell = clay
    ? { back: s.walls, side: "#e4ded4", floor: s.floor, window: "#fbfaf7" }
    : { back: "#d9d9d9", side: "#cfcfcf", floor: "#8c8c8c", window: "#ffffff" }
  const sofa = clay ? s.clayLight : id(0)
  const sofaShade = clay ? s.clayMid : id(0)
  const table = clay ? s.clayMid : id(1)
  const chair = clay ? s.clayLight : id(2)
  const rug = clay ? "#d6cfc4" : id(3)
  const lamp = clay ? s.clayDark : id(4)
  const defs = clay
    ? `<defs>
        <radialGradient id="light" cx="0.62" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0.12"/>
        </radialGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
      </defs>`
    : ""
  const shadow = (cx: number, cy: number, rx: number, ry: number) =>
    clay
      ? `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="0.16" filter="url(#soft)"/>`
      : ""
  return svg(`${defs}
    <rect width="1536" height="1024" fill="${shell.back}"/>
    <polygon points="0,0 260,90 260,700 0,1024" fill="${shell.side}"/>
    <polygon points="0,1024 260,700 1536,700 1536,1024" fill="${shell.floor}"/>
    <rect x="820" y="150" width="520" height="430" rx="6" fill="${shell.window}"/>
    <ellipse cx="760" cy="860" rx="560" ry="120" fill="${rug}"/>
    ${shadow(640, 760, 420, 40)}
    <rect x="300" y="560" width="680" height="190" rx="70" fill="${sofaShade}"/>
    <rect x="330" y="470" width="620" height="150" rx="60" fill="${sofa}"/>
    <rect x="340" y="610" width="600" height="90" rx="40" fill="${sofa}"/>
    ${shadow(1060, 880, 200, 26)}
    <ellipse cx="1060" cy="800" rx="210" ry="56" fill="${table}"/>
    <rect x="980" y="800" width="160" height="70" fill="${table}"/>
    <ellipse cx="1060" cy="870" rx="80" ry="20" fill="${table}"/>
    ${shadow(1320, 790, 130, 20)}
    <rect x="1220" y="560" width="210" height="220" rx="80" fill="${chair}"/>
    <rect x="1250" y="440" width="150" height="40" rx="18" fill="${lamp}"/>
    <rect x="1322" y="480" width="8" height="90" fill="${lamp}"/>
    ${clay ? '<rect width="1536" height="1024" fill="url(#light)"/>' : ""}
  `)
}
