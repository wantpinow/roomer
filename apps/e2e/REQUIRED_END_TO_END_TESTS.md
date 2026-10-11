# Required end-to-end tests

Every user-facing (and agent-facing) capability of Roomer, and the Playwright spec that covers it.
`[x]` = covered by `pnpm e2e`; `[ ]` = not covered yet, with why. Specs live in `tests/`; each
starts from a wiped backend seeded through the trapdoor (`livingRoom` fixture: the living room,
the generic library and the "Starter" layout).

Run it: `pnpm e2e` (boots Convex on :3220 and Next on :3100 with `PHOTOREAL_STUB=1`, about a
minute). One spec: `pnpm e2e tests/walk.spec.ts`. The paid one:
`E2E_PHOTOREAL_LIVE=1 pnpm e2e tests/photoreal-live.spec.ts`.

## Every page

- [x] Each top-level route renders its live content with no error boundary and no console error —
      `smoke.spec.ts` (`/`, `/rooms/[id]`, `/library`, `/library/[assetId]`, `/styleguide`,
      `/render/sandbox`, `/render`)
- [x] A room id that doesn't exist shows "There's no room here", not a crash — `smoke.spec.ts`
- [x] Console errors fail any passing test unless declared (`consoleErrors.allow`) — the
      `consoleErrors` auto-fixture, in every spec

## Rooms index (`/`)

- [x] Lists each room with its outline, figures and layouts — `smoke.spec.ts` (rooms index)
- [ ] Opening a room from its card — covered implicitly (every workspace spec navigates by URL);
      the card link itself isn't clicked

## Workspace (`/rooms/[roomId]`)

Watching:

- [x] The plan draws one item per placement (core's SVG and the hit layer) — `workspace.spec.ts`
- [x] Switching layouts from the rail (URL, selection, plan and caption follow) —
      `workspace.spec.ts`
- [x] A new empty layout from the rail's + opens straight away — `workspace.spec.ts`
- [x] Lint issues: E001 shows with the server's message, hint and item chips; hovering outlines
      the items in the plan; selecting washes them in the issue's severity — `workspace.spec.ts`
- [x] Agent edits stream in live: the activity feed, the revision and the "Agent active" pill
      update without a reload — `workspace.spec.ts`
- [x] Items tab lists every piece and totals prices live as the agent adds a priced one —
      `workspace.spec.ts`
- [x] 3D and Camera views mount a WebGL canvas; the camera picker switches viewpoints —
      `workspace.spec.ts`
- [x] Renders tab: request a (stub) photoreal render, watch it arrive, open it in the lightbox —
      `workspace.spec.ts`
- [x] A render made over MCP appears in the Renders tab — `mcp-flow.spec.ts`
- [ ] Rename, duplicate and re-status a layout from its actions menu — not covered
- [ ] Plan zoom and pan (buttons, ⌃-scroll, drag on empty space) — not covered
- [ ] Narrow-screen layout (inspector in a sheet), dark theme — visual, not covered
- [ ] Lightbox previous/next and the clay/photoreal compare slider — not covered (needs two
      finished renders)

Editing in the plan:

- [x] Drag an item with the pointer: snapped to the 10mm grid, linted live while dragging, saved
      as a `move` (server x/z, revision +1, lint re-run and mirrored in the panel) —
      `plan-edit.spec.ts`
- [x] Arrow keys nudge (10mm, Shift 100mm) and R turns 15°, each a `nudge` op; Escape deselects —
      `plan-edit.spec.ts`
- [x] Delete removes the selected item; the toast's Undo restores it exactly — `plan-edit.spec.ts`
- [x] The agent edits the layout mid-drag: the drop is refused with a toast and the agent's
      version stands — caught locally once the page has seen the new revision, and by the
      backend's revision check (CONFLICT) when it hasn't — `plan-edit.spec.ts`

Walking:

- [x] Walk mode mounts (spawn at eye height) and Escape returns to the plan — `walk.spec.ts`
- [x] Walking into furniture stops at its surface; the physics records the bump and the UI shows
      no "Bumped into …" message — `walk.spec.ts`
- [x] Items too high to step onto stop you; a jump lands you on top (coffee table) —
      `walk.spec.ts`
- [x] A six-footer walks under the ceiling beam; jumping under it hits it — `walk.spec.ts`
- [ ] Real keyboard and pointer-lock input (WASD, mouse look) — the specs drive the physics
      through the dev-only `window.__roomerWalk` handle; key handling is unit-tested in
      `apps/web/lib/walk/tests/keys.test.ts`

## Library (`/library`, `/library/[assetId]`)

- [x] Lists every seeded piece plus custom ones, with a count — `library.spec.ts`
- [x] Search by name (debounced, in the URL, clear button) — `library.spec.ts`
- [x] Category and source filters, combined, surviving a reload — `library.spec.ts`
- [x] Asset page: name, size (W × D × H), price, retailer and variant, key, product link and the
      turning clay model with its part count — `library.spec.ts`
- [ ] "Regenerate previews" — not covered (the same pipeline runs in `mcp-flow.spec.ts` via
      `create_asset`)
- [ ] Product photos on cards and the asset page — not covered (needs image downloads)

## Agent (MCP at `/api/mcp/mcp`)

- [x] Lists every tool with a description and an object input schema, plus the agent guide as
      instructions — `mcp-flow.spec.ts`
- [x] `create_room` from walk measurements: solved corners, zero residual, plan PNG —
      `mcp-flow.spec.ts`
- [x] `apply_shell_changes` adds a radiator; `get_room` shows it — `mcp-flow.spec.ts`
- [x] `create_asset` from parts returns four 768×768 clay previews and stores them —
      `mcp-flow.spec.ts`
- [x] `create_layout`, then `apply_changes` reports an overlap as E001 (code, message, hint) and a
      second `apply_changes` fixes it (lint ok) — `mcp-flow.spec.ts`
- [x] `render_plan` returns the floor plan PNG — `mcp-flow.spec.ts`
- [x] `render_view` clay + id: right sizes; every placement's palette colour is present in the id
      pass and named in the legend — `mcp-flow.spec.ts`
- [x] `render_photoreal` (stub) stores a done render record; `list_renders` lists it —
      `mcp-flow.spec.ts`
- [x] `get_overview` reflects the room, layout, revision, lint, price and custom asset —
      `mcp-flow.spec.ts`
- [x] Errors come back as `isError` results an agent can act on: unknown walls (shell and layout
      ops) name the wall and list the real ones, nothing is applied; a room id passed as a layout
      id says so — `mcp-flow.spec.ts`
- [ ] `set_room_shell`, `set_camera`, `update_asset`, `preview_asset`, `update_layout`,
      `lint_layout`, `search_assets`, `get_asset` — exercised by unit tests
      (`apps/web/server/mcp/**/tests`), not end to end
- [ ] `add_asset_images`, `add_room_photos` — need outbound downloads; not covered

## Photoreal

- [x] The stub renderer end to end (clay + id passes → stored render) — `mcp-flow.spec.ts`,
      `workspace.spec.ts`
- [x] One real render through AI Gateway (`openai/gpt-image-2.5-flare`, low quality, the smallest
      size) — `photoreal-live.spec.ts`, **skipped unless `E2E_PHOTOREAL_LIVE=1`** (it costs money)
