import type { Metadata } from "next"

import { RoomsIndex } from "./_components/rooms-index"

// The layout's "%s · Roomer" template only applies to child segments, so
// the home page names itself outright.
export const metadata: Metadata = {
  title: { absolute: "Roomer" },
}

export default function HomePage() {
  return <RoomsIndex />
}
