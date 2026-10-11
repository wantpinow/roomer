import "server-only"

// The app's entry point to headless rendering (MCP tools, photoreal
// pipeline). The implementation lives in ./headless-renderer so Node
// scripts can use it without Next's `server-only` resolution.

export {
  closeRenderer,
  DEFAULT_PREVIEW_SIZE,
  RENDER_TIMEOUT_MS,
  renderAssetPreviews,
  renderScene,
} from "./headless-renderer"
