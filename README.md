# roomer

Design the rooms in your house with an AI agent. Roomer stores each room's fixed parts (walls,
doors, windows, radiators, sockets, beams), the furniture you're considering and any number of
candidate **layouts**, and **lints** every layout on every change: overlaps, blocked doors and
walkways, sofas in front of radiators, chairs with no room to pull out. Your AI (Claude Code, over
MCP) does the designing; the web app is where you look, walk around, tweak and compare. When a
layout looks right, Roomer renders a grey "clay" view and an image model paints it
photorealistically using the products' own photos.

## Quick start

```bash
pnpm install
```

```bash
pnpm dev
```

That starts a local Convex backend (no account needed) on :3210 and the app on
http://localhost:3000. On a fresh database, load the designed living room, the Castlery
furniture and the candidate layouts:

```bash
pnpm seed --import
```

Photoreal renders use `AI_GATEWAY_API_KEY` from the repo-root `.env.local` (Vercel AI Gateway).
Set `PHOTOREAL_STUB=1` to get free stub images instead.

### Use it from Claude Code

The repo's `.mcp.json` registers the `roomer` MCP server
(`http://localhost:3000/api/mcp/mcp`). Start `claude` in this folder, approve the server, and ask
for something like "show me the living room plan" or "add these three products and try a layout
with the sofa facing the window". Watch the workspace update live in the browser. To use it from
any folder:

```bash
claude mcp add --transport http roomer http://localhost:3000/api/mcp/mcp
```

Without an AI, call tools directly (images land in `.roomer-out/mcp/`):

```bash
pnpm mcp get_overview '{}'
```

## What's in the app

- **Workspace** (`/rooms/[id]`): layouts rail · stage with **Plan** (architect-style floor plan;
  drag to move, rectangle-select and move groups, arrows nudge, R rotates, Delete removes,
  **Add item** places furniture with live lint and wall snapping), **3D** (orbit), **Camera**
  (saved viewpoints, rectilinear or fisheye) and **Walk** (first person at your height — WASD,
  Space jumps, Enter takes a photoreal "photo") · inspector with Issues, Items (with prices),
  Activity (what the agent changed) and Renders.
- **Library** (`/library`): every asset with its clay previews, product photos, size and price.
- **MCP tools** (24): rooms and features, assets built from simple parts (with previews and
  side-by-side product-photo comparison sheets), layouts edited with wall-relative placement
  helpers, lint, floor-plan / 3D / photoreal renders. The agent guide in
  [docs/agent-guide.md](docs/agent-guide.md) is served as the server's instructions.

## Commands

See [CLAUDE.md](CLAUDE.md) for the full list (tests, e2e, seeding, export/import, MCP CLI) and the
conventions every change follows.

```bash
pnpm test
```

```bash
pnpm e2e
```

## Docs

- [docs/spec.md](docs/spec.md) — what Roomer is (product spec)
- [docs/2026-10-11-v1-architecture.md](docs/2026-10-11-v1-architecture.md) — how it's built
- [docs/2026-10-11-v1-status.md](docs/2026-10-11-v1-status.md) — what v1 does today, known gaps
- [docs/2026-10-11-photoreal-spike.md](docs/2026-10-11-photoreal-spike.md) — image model comparison
- `docs/2026-10-11-dogfood-*.md` — what agents found building real assets through the MCP tools
