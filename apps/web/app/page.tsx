import type { Metadata } from "next"

import { HomeContent } from "./_components/home-content"

// The layout's "%s | Roomer" template only applies to child segments, so
// the home page names itself outright.
export const metadata: Metadata = {
  title: { absolute: "Roomer" },
}

export default function HomePage() {
  return <HomeContent />
}
