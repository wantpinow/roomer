import type { Metadata } from "next"

import { StyleguideContent } from "./_components/styleguide-content"

export const metadata: Metadata = {
  title: "Styleguide",
  description: "Every Roomer component, with fixture data, in both themes.",
}

export default function StyleguidePage() {
  return <StyleguideContent />
}
