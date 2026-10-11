import type { Metadata, Viewport } from "next"
import { Albert_Sans, Fragment_Mono, Newsreader } from "next/font/google"

import "@roomer/ui/globals.css"

import { ConvexClientProvider } from "@/components/misc/convex-client-provider"
import { ThemeScript } from "@/components/shell/theme-script"
import { designTokens } from "@/lib/design-tokens"
import { TooltipProvider } from "@roomer/ui/components/tooltip"
import { cn } from "@roomer/ui/lib/utils"

export const metadata: Metadata = {
  title: {
    template: "%s · Roomer",
    default: "Roomer",
  },
  description: "Room layouts, checked for mistakes.",
}

export const viewport: Viewport = {
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: designTokens.light.paper,
    },
    { media: "(prefers-color-scheme: dark)", color: designTokens.dark.paper },
  ],
}

// Type pairing (architecture §7): Albert Sans — a grotesk drawn from
// Scandinavian modernism — for the UI; Newsreader, a soft, low-contrast
// serif with optical sizes, for headings and the wordmark; Fragment Mono for
// lint codes and measurement readouts.
const fontSans = Albert_Sans({
  subsets: ["latin"],
  variable: "--font-albert-sans",
  display: "swap",
})
const fontDisplay = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
})
const fontMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-fragment-mono",
  display: "swap",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en-GB"
      // ThemeScript adds `dark` to this element before hydration.
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontDisplay.variable,
        fontMono.variable
      )}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-svh bg-background font-sans text-foreground">
        <ConvexClientProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ConvexClientProvider>
      </body>
    </html>
  )
}
