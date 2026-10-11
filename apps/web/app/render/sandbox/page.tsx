import type { Metadata } from "next"

import { SceneSandbox } from "./_components/scene-sandbox"

// Developer sandbox: the furnished fixture room in the interactive viewer,
// with pass and view switches. Handy for checking scene changes by eye.
export const metadata: Metadata = {
  title: "Scene sandbox",
  robots: { index: false, follow: false },
}

export default function SceneSandboxPage() {
  return <SceneSandbox />
}
