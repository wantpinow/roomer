import type { Point } from "../geometry/angles"

// A tiny string-based SVG writer: numbers rounded to 0.1mm so output is
// stable for snapshots, attributes and text escaped, and helpers for paths.

/** 1234.567 → "1234.6", 2 → "2", -0.01 → "0". */
export function num(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Object.is(rounded, -0) || rounded === 0 ? "0" : String(rounded)
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export type Attrs = Record<string, string | number | undefined | false>

function attrs(attributes: Attrs): string {
  let out = ""
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue
    const text = typeof value === "number" ? num(value) : escapeXml(value)
    out += ` ${key}="${text}"`
  }
  return out
}

/** `<tag a="1">children</tag>`, or self-closing without children. */
export function el(
  tag: string,
  attributes: Attrs = {},
  children?: string | readonly string[]
): string {
  const body = Array.isArray(children) ? children.join("") : children
  return body === undefined || body === ""
    ? `<${tag}${attrs(attributes)}/>`
    : `<${tag}${attrs(attributes)}>${body}</${tag}>`
}

/** Text content, escaped. */
export function text(content: string): string {
  return escapeXml(content)
}

/** Closed path data for one or more rings ("M … Z M … Z"). */
export function ringsPath(rings: readonly (readonly Point[])[]): string {
  return rings
    .filter((ring) => ring.length >= 2)
    .map((ring) => `M${ring.map(([x, z]) => `${num(x)} ${num(z)}`).join("L")}Z`)
    .join("")
}

/** Open polyline path data. */
export function linePath(points: readonly Point[]): string {
  return `M${points.map(([x, z]) => `${num(x)} ${num(z)}`).join("L")}`
}

/** "translate(x z) rotate(a)" for placing rotated text. */
export function placeAt(at: Point, angle = 0): string {
  return angle === 0
    ? `translate(${num(at[0])} ${num(at[1])})`
    : `translate(${num(at[0])} ${num(at[1])}) rotate(${num(angle)})`
}

/**
 * Angle (degrees) of a direction, flipped so text along it reads from the
 * bottom or the right of the sheet (vertical text runs bottom to top).
 */
export function uprightAngle(direction: Point): number {
  let angle = (Math.atan2(direction[1], direction[0]) * 180) / Math.PI
  if (angle > 90.5) angle -= 180
  else if (angle < -90.5) angle += 180
  if (angle > 89.5) angle -= 180
  return Math.abs(angle) < 1e-9 ? 0 : angle
}
