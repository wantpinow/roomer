/** localStorage key holding the explicit theme choice ("light" | "dark"). */
export const THEME_STORAGE_KEY = "roomer-theme"

// Runs before first paint (rendered into <head> by the root layout) so the
// page never flashes the wrong theme: an explicit choice wins, otherwise the
// OS preference. Kept tiny and dependency-free on purpose.
const script = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`

/**
 * Inline, render-blocking theme bootstrap. A server component: the script
 * ships in the HTML and React never re-executes it on the client.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
