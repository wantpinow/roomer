import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tailwind-merge only knows Tailwind's default scales. Teach it the custom
// theme values from globals.css; otherwise it reads e.g. `text-ui` (a font
// size) as a text colour and drops it when a `text-foreground` follows.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["2xs", "ui"],
      shadow: ["hairline", "soft", "float", "pop"],
      tracking: ["label"],
      ease: ["out-soft"],
      animate: ["live", "shimmer", "rise"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
