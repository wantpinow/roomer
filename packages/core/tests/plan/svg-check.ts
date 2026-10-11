// A tiny, dependency-free well-formedness check for the plan SVG (no DOM in
// Node): every tag closes in order, attributes are quoted and nothing is
// left unescaped. Plus helpers to pull elements out by attribute.

const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g

export function assertWellFormed(svg: string): void {
  const stack: string[] = []
  let cursor = 0
  for (const match of svg.matchAll(TAG)) {
    const between = svg.slice(cursor, match.index)
    if (/[<>]/.test(between)) {
      throw new Error(`Stray markup before offset ${match.index}: ${between}`)
    }
    if (/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(between)) {
      throw new Error(`Unescaped & in text: ${between}`)
    }
    cursor = match.index + match[0].length
    const [, closing, name, , selfClosing] = match
    if (selfClosing) continue
    if (closing) {
      const open = stack.pop()
      if (open !== name) throw new Error(`</${name}> closes <${open}>`)
    } else {
      stack.push(name!)
    }
  }
  if (svg.slice(cursor).trim() !== "") {
    throw new Error(`Trailing content: ${svg.slice(cursor)}`)
  }
  if (stack.length > 0) throw new Error(`Unclosed: ${stack.join(", ")}`)
  if (!svg.startsWith("<svg ")) throw new Error("Not an <svg> document")
}

/** Values of an attribute across every element that has it. */
export function attributeValues(svg: string, name: string): string[] {
  const pattern = new RegExp(`\\s${name}="([^"]*)"`, "g")
  return [...svg.matchAll(pattern)].map((m) => m[1]!)
}

/** The full source of every <g …> group whose opening tag matches. */
export function groups(svg: string, opening: RegExp): string[] {
  const found: string[] = []
  for (const match of svg.matchAll(/<g\b[^>]*>/g)) {
    if (!opening.test(match[0])) continue
    if (match[0].endsWith("/>")) {
      found.push(match[0])
      continue
    }
    // Walk forward to the matching </g>.
    let depth = 0
    const tags = /<(\/?)g\b[^>]*?(\/?)>/g
    tags.lastIndex = match.index
    for (const tag of svg.matchAll(tags)) {
      if (tag.index < match.index) continue
      if (tag[2]) continue
      depth += tag[1] ? -1 : 1
      if (depth === 0) {
        found.push(svg.slice(match.index, tag.index + tag[0].length))
        break
      }
    }
  }
  return found
}
