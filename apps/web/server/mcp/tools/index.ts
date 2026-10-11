import type { RoomerTool } from "../tool"

import { assetTools } from "./assets"
import { overviewTools } from "./overview"
import { roomTools } from "./rooms"

/** Every Roomer MCP tool, in the order agents see them. */
export const ROOMER_TOOLS: readonly RoomerTool[] = [
  ...overviewTools,
  ...roomTools,
  ...assetTools,
]
