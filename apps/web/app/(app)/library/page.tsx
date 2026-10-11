import type { Metadata } from "next"
import { Suspense } from "react"

import { LibraryContent } from "./_components/library-content"

export const metadata: Metadata = {
  title: "Library",
  description: "Furniture the agent can place: products and starter pieces.",
}

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryContent />
    </Suspense>
  )
}
