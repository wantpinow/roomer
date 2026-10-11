// Labels for render records.

const PROVIDERS: Record<string, string> = {
  openai: "OpenAI",
  google: "Google",
  bfl: "Black Forest Labs",
}

export interface ModelLabel {
  /** "OpenAI", or null for the stub / unknown providers. */
  provider: string | null
  /** The model's own name: "gpt-image-2.5-sunburst". */
  name: string
}

/** "openai/gpt-image-2.5-sunburst" → { provider: "OpenAI", name: "gpt-image-2.5-sunburst" }. */
export function modelLabel(model: string): ModelLabel {
  const slash = model.indexOf("/")
  if (slash === -1) {
    return { provider: null, name: model === "stub" ? "stub renderer" : model }
  }
  const prefix = model.slice(0, slash)
  return {
    provider: PROVIDERS[prefix] ?? prefix,
    name: model.slice(slash + 1),
  }
}

/** 42_300 → "42 s"; 95_000 → "1 min 35 s"; 800 → "0.8 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${(Math.round(ms / 100) / 10).toFixed(1)} s`
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`
}
