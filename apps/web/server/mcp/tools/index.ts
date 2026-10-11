import type { RoomerTool } from "../tool"

import { assetTools } from "./assets"
import { layoutTools } from "./layouts"
import { overviewTools } from "./overview"
import { renderTools } from "./renders"
import { roomTools } from "./rooms"
import { viewTools } from "./views"

/** Every Roomer MCP tool, in the order agents see them. */
export const ROOMER_TOOLS: readonly RoomerTool[] = [
  ...overviewTools,
  ...roomTools,
  ...assetTools,
  ...layoutTools,
  ...viewTools,
  ...renderTools,
]
