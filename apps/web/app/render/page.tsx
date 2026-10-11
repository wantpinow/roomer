import type { Metadata } from "next"

import { RenderHost } from "./_components/render-host"

// A bare page for the headless renderer (server/render/renderer.ts): no app
// chrome, no data access. Playwright opens it once and calls
// `window.roomer.render(scene)` for each picture.
export const metadata: Metadata = {
  title: "Render",
  robots: { index: false, follow: false },
}

export default function RenderPage() {
  return <RenderHost />
}
