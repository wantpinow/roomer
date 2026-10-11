import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "@roomer/ui/globals.css"

import { ConvexClientProvider } from "@/components/misc/convex-client-provider"
import { cn } from "@roomer/ui/lib/utils"

export const metadata: Metadata = {
  title: {
    template: "%s | Roomer",
    default: "Roomer",
  },
  description: "Room layouts, checked for mistakes.",
}

// Placeholder type pairing; the UI milestone picks the real one
// (architecture §7: a refined grotesk + a soft serif).
const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "antialiased",
        fontSans.variable,
        fontMono.variable,
        "font-sans"
      )}
    >
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  )
}
