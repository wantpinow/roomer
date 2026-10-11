# Roomer

Roomer stores room layouts and checks them for mistakes, and its main user is an AI agent.
A room's fixed parts (walls, doors, windows, radiators, sockets) are described once as a JSON
document; furniture goes into named **layouts**; a **linter** reports overlaps, blocked doors and
the like on every change; and a plain grey "clay" render can be sent with product photos to an
image model for a photoreal version. The agent (Claude Code, over MCP on localhost) does most of
the work; the web UI is for looking and checking. Single user, everything local.

Read before writing code: [docs/spec.md](docs/spec.md) (what) and
[docs/2026-10-11-v1-architecture.md](docs/2026-10-11-v1-architecture.md) (how; it wins where they
disagree). Structure and tooling mirror `../masterguest`.

## Repo layout

```
apps/web/              Next.js 16 app (App Router): UI, /render, /api/mcp, server-side pipelines
apps/e2e/              Playwright suite (isolated stack on :3100 / :3220)
packages/core/         @roomer/core — pure TS domain: zod schemas, geometry, lint, plan SVG
packages/backend/      @roomer/backend — Convex (convex/), tests/, scripts/ (seed, e2e backend)
packages/ui/           @roomer/ui — shadcn/radix primitives, globals.css (Tailwind v4), cn()
packages/eslint-config/  flat configs (base, next-js, react-internal) + custom rules
packages/typescript-config/  base.json, nextjs.json, react-library.json
seed/                  seed data (product research, exported assets/layouts)
```

Internal packages export raw `.ts` — no build step. Web imports the backend as
`@roomer/backend/convex/_generated/api` and lists `@roomer/ui`, `@roomer/backend`, `@roomer/core`
in `transpilePackages`. `@roomer/core` must not import React, three.js, Convex or Node APIs.

## Commands

```bash
pnpm dev            # Convex local backend (:3210) + Next (:3000), via turbo
pnpm test           # vitest in every package
pnpm lint           # eslint, zero warnings
pnpm typecheck      # tsc in every package
pnpm format         # prettier --write (format:check in CI-style runs)
pnpm e2e            # Playwright: boots its own backend (:3220) + Next (:3100), then runs specs
pnpm e2e:ui         # same, Playwright UI mode
pnpm seed           # seed the dev deployment: living room, starter library, "Starter" layout (idempotent)
pnpm seed --refresh # also bring the existing living room back in line with its fixture (keeps ids, layouts)
pnpm mcp --list     # list the MCP tools of the running server (needs `pnpm dev`)
pnpm mcp <tool> '<json>'  # call a tool; images land in .roomer-out/mcp/ (paths printed); exit 1 on a tool error
pnpm mcp <tool> @args.json  # arguments from a file (big asset specs); --json also prints structuredContent
```

Run one package: `pnpm --filter @roomer/core test`, `pnpm --filter web dev`.

**MCP server:** Streamable HTTP at `http://localhost:3000/api/mcp/mcp` (local requests only),
instructions = `docs/agent-guide.md`. The repo's `.mcp.json` registers it as `roomer`, so Claude
Code started in this repo connects once `pnpm dev` is running (approve the project server when
asked; check with `/mcp` or `claude mcp list`). Elsewhere:
`claude mcp add --transport http roomer http://localhost:3000/api/mcp/mcp`.

## Ports and local Convex

| Stack            | Next               | Convex API / HTTP actions | Notes                                                           |
| ---------------- | ------------------ | ------------------------- | --------------------------------------------------------------- |
| dev (`pnpm dev`) | 3000               | 3210 / 3211               | anonymous local deployment, data in `packages/backend/.convex/` |
| e2e (`pnpm e2e`) | 3100 (`.next-e2e`) | 3220 / 3221               | backend binary, data in `packages/backend/.convex-e2e/`         |

- **Dev backend** = the backend's `dev` script,
  `CONVEX_AGENT_MODE=anonymous convex dev --local-cloud-port 3210 --local-site-port 3211`.
  No Convex account needed. It writes `packages/backend/.env.local` (`CONVEX_DEPLOYMENT=anonymous:anonymous-agent`, URLs), regenerates
  `convex/_generated/`, and pushes functions on every change. Ports are pinned so a busy 3210 fails
  loudly instead of silently moving.
- **Web → Convex URL**: `apps/web/.env` (committed, non-secret) sets
  `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`. `dev:e2e` overrides it inline with :3220.
- **Secrets**: `AI_GATEWAY_API_KEY` lives in the repo-root `.env.local` (gitignored).
  `apps/web/load-root-env.ts` loads it via `@next/env`. Never commit or print `.env*.local`.
- **E2E backend** (`scripts/e2e-backend.ts`) drives the local backend binary directly over the
  self-hosted protocol (`.env.e2e`), because any `convex dev` mode would rewrite `.env.local` and
  hijack the dev stack. `e2e:setup` sets `E2E_TESTING_ENABLED` and deploys; global setup then calls
  the `e2e:reset` trapdoor. `E2E_RESET=1` wipes the e2e data dir.

## Before every commit

> **Before every commit**, you MUST:
>
> 1. Run `pnpm format` — CI fails on any file it would change
> 2. Run `pnpm lint` — fix ALL errors AND warnings (zero tolerance)
> 3. Run `pnpm typecheck` — fix ALL type errors
> 4. Run `pnpm test` — fix ALL failing tests
> 5. If you added new business logic that wouldn't be caught by the typechecker (authorization rules, state machine transitions, validation logic, algorithms), add or update tests before committing

Run `pnpm e2e` before milestone commits. Stage specific paths (`git add <paths>`), never
`git add -A` — other agents work in this tree concurrently.

## Convex rules (packages/backend/convex)

- **Thin handlers.** Handlers only forward `ctx` to exported `do*` helpers (`doCreateRoom`,
  `doApplyChanges`); helpers own the logic and are what tests call. Lint-enforced
  (`require-thin-handler`: no `ctx.db/storage/scheduler/run*/auth` inside `handler:`).
- **Wrappers only.** Public functions use `appQuery` / `appMutation` / `appAction` from
  `convex/functions.ts`. Raw `query`/`mutation`/`action` from `./_generated/server` are lint-banned
  unless the file is in `RAW_BUILDER_EXEMPTIONS` (backend `eslint.config.js`) with a reason.
  Internal functions (`internalMutation`, …) may use raw builders.
- `args` validators on **all** functions (`{}` when none). Always `await` every promise.
- `.withIndex()`, never `.filter()`. Limit `.collect()`; never `.collect().length`.
- **No `Date.now()` in queries** — pass `now` from the client.
- `ConvexError` for anything a person/agent should read (structured
  `{ code: "INVALID_INPUT", issues }` for validation); plain `Error` for invariants.
- `db.patch` doesn't remove fields; use `db.replace` when a union variant goes backwards.
- New table → `schema.ts` + add it to `RESETTABLE_TABLES` in `convex/e2e.ts` (typecheck enforces it).
- Index names `by_<field>`; search indexes `search_<field>`; every schema field gets a comment.

## Types & validation (architecture §2)

- **Zod 4 schemas in `@roomer/core/src/schema/` are the single source of truth** for every domain
  shape; agent-facing fields carry `.describe()`.
- Convex validators are **derived** with `zodToConvex` from `convex-helpers/server/zod4` (in
  `convex/validators.ts`); Convex-only fields (ids, storage ids, timestamps) are added in the backend.
- Functions validate twice: structurally (derived `v` validators) and semantically (zod `.parse`
  in the `do*` helper). MCP tool input schemas are the same zod schemas.
- Type-level tests (`expectTypeOf`) keep `Infer<typeof vX>` and `z.infer<typeof X>` in sync.
- Units: integer millimetres, degrees. See architecture §3 for frames, bearings and ids.

## Code principles

- Single source of truth: derive types (`typeof`, `Infer`, `z.infer`, `FunctionReturnType`),
  never restate them.
- **Never `as any`.** Prefer `satisfies`; if you must cast, cast to the specific type.
- Every `page.tsx` is a server component exporting `metadata` (lint-enforced); client logic lives in
  a sibling `_components/` folder. Query hooks come from `convex-helpers/react/cache`
  (lint-enforced, autofixable).
- Shared primitives in `packages/ui`; app components in `apps/web/components/<area>/`; page-only
  components in `app/**/_components/`. Files kebab-case, exports PascalCase.
- Never put `useQuery` results in `useEffect` deps. In render, `const [now] = useState(() => Date.now())`.
- API keys stay server-side — never `NEXT_PUBLIC_*`. Logs carry ids and kinds, not personal data.
- Lint uses `eslint-plugin-only-warn` + `--max-warnings 0`: every finding is a warning, and any
  warning fails.

## Tests

- Tests live in `tests/` folders next to the code, named `<module>.test.ts`:
  `packages/core/tests/**`, `packages/backend/tests/**` (outside `convex/` so it isn't deployed),
  `apps/web/{lib,server,components}/**/tests/`, `packages/eslint-config/rules/tests/`.
- Backend: vitest 4 + `convex-test` in the `edge-runtime` environment. Use `createTestConvex()`
  from `tests/setup.ts` and call `do*` helpers through `t.run(...)`; `describe` = helper name,
  `it` = a sentence. Assert errors with `.rejects.toThrow("…")`.
- Test validation, algorithms, state transitions and pure utilities. Don't test simple CRUD,
  layout, or third-party libraries.
- E2E specs import `test` from `apps/e2e/fixtures` (auto `consoleErrors` fixture fails a passing
  test that logged an error; declare expected ones with `consoleErrors.allow`). Arrange state via
  the typed trapdoor client (`fixtures/convex.ts`), drive only the seam under test through the UI.
  Selectors: `getByRole`/`getByLabel`, then `data-*`, then `data-testid`. Photoreal renders are
  stubbed in e2e (`PHOTOREAL_STUB=1`); a live render must be opt-in and cheap.

## Commits

Conventional Commits with a scope — `feat(core): …`, `fix(backend): …`, `test(e2e): …`,
`chore(repo): …`, `docs: …`. Subject in the imperative; a body of short prose explaining **why**.
End every message with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Work happens on `feat/v1`; don't push without being asked.
