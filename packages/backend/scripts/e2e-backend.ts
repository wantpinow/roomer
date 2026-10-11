/**
 * Boots the Convex local backend that the e2e suite runs against, on
 * 127.0.0.1:3220 (API) / 3221 (HTTP actions) — never 3210/3211, which belong
 * to the dev deployment that `pnpm dev` runs.
 *
 * Why not `npx convex dev`? Because every deployment-selecting mode of the CLI
 * (anonymous, agent, `--configure`) rewrites `packages/backend/.env.local` to
 * point at whatever deployment it just started — which would silently redirect
 * the developer's own `pnpm dev` at the throwaway e2e database. Driving the
 * backend binary ourselves and talking to it over the self-hosted protocol
 * (`CONVEX_SELF_HOSTED_URL` + `CONVEX_SELF_HOSTED_ADMIN_KEY` in `.env.e2e`)
 * keeps `.env.local` completely untouched.
 *
 * The instance secret below is a fixed local-only development constant. It
 * grants nothing beyond a SQLite file inside this repo, and pinning it is what
 * makes the admin key — and so `.env.e2e` — reproducible on any machine.
 *
 * Ported from masterguest's packages/backend/scripts/e2e-backend.ts.
 */
import { execFileSync, spawn } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const INSTANCE_NAME = "roomer-e2e"
const INSTANCE_SECRET =
  "4e2e4e2e4e2e4e2e4e2e4e2e4e2e4e2e4e2e4e2e4e2e4e2e4e2e4e2e4e2e4e2e"
const PORT = Number(process.env.E2E_CONVEX_PORT ?? 3220)
const SITE_PORT = Number(process.env.E2E_CONVEX_SITE_PORT ?? 3221)

const backendRoot = resolve(import.meta.dirname, "..")
const dataDir = join(backendRoot, ".convex-e2e")
const envFile = join(backendRoot, ".env.e2e")

const CACHE_DIR = join(homedir(), ".cache", "convex", "binaries")

/**
 * The CLI caches backend builds under ~/.cache/convex/binaries, keyed by
 * release tag. We take the newest rather than pinning one: the cache contents
 * differ per machine and any recent build serves.
 */
function findCachedBinary(): string | null {
  if (!existsSync(CACHE_DIR)) return null
  const builds = readdirSync(CACHE_DIR)
    .filter((entry) => entry.startsWith("precompiled-"))
    .sort()
    .reverse()
  for (const build of builds) {
    const candidate = join(CACHE_DIR, build, "convex-local-backend")
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** The release asset for this machine, named as convex-backend publishes them. */
function assetName(): string {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64"
  const platform =
    process.platform === "darwin" ? "apple-darwin" : "unknown-linux-gnu"
  return `convex-local-backend-${arch}-${platform}.zip`
}

/**
 * Fetch a backend build into the CLI's own cache. `pnpm dev` (convex dev's
 * anonymous mode) usually warms the cache first; a fresh machine has none.
 */
async function downloadBinary(): Promise<string> {
  const release = (await (
    await fetch(
      "https://api.github.com/repos/get-convex/convex-backend/releases/latest",
      { headers: { "User-Agent": "roomer-e2e" } }
    )
  ).json()) as {
    tag_name: string
    assets: { name: string; browser_download_url: string }[]
  }

  const wanted = assetName()
  const asset = release.assets.find((a) => a.name === wanted)
  if (!asset) {
    throw new Error(
      `convex-backend ${release.tag_name} publishes no ${wanted}. Assets: ${release.assets
        .map((a) => a.name)
        .join(", ")}`
    )
  }

  const target = join(CACHE_DIR, release.tag_name)
  mkdirSync(target, { recursive: true })
  const zipPath = join(target, wanted)

  console.log(`e2e: downloading ${release.tag_name} (${wanted})`)
  const response = await fetch(asset.browser_download_url)
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`
    )
  }
  writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()))
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", target])
  rmSync(zipPath, { force: true })

  const binaryPath = join(target, "convex-local-backend")
  chmodSync(binaryPath, 0o755)
  return binaryPath
}

/**
 * The admin key is derived from the instance name + secret, so this is
 * deterministic — every run and every machine produces the same `.env.e2e`.
 *
 * Null for a build that predates the `keygen` subcommand (mid-2026), which
 * parses `keygen` as the database path and refuses `admin-key`.
 */
function mintAdminKey(candidate: string): string | null {
  try {
    return execFileSync(
      candidate,
      [
        "keygen",
        "admin-key",
        "--instance-name",
        INSTANCE_NAME,
        "--instance-secret",
        INSTANCE_SECRET,
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    )
      .toString()
      .trim()
  } catch {
    return null
  }
}

const cached = findCachedBinary()
let binary = cached
let adminKey = cached ? mintAdminKey(cached) : null
if (binary === null || adminKey === null) {
  if (cached) {
    console.log(
      `e2e: ${cached} cannot mint an admin key; fetching the latest release`
    )
  }
  binary = await downloadBinary()
  adminKey = mintAdminKey(binary)
  if (adminKey === null) {
    throw new Error(`${binary} does not support \`keygen admin-key\``)
  }
}

/**
 * The e2e database is disposable. `E2E_RESET=1` starts from nothing; CI
 * always does. (Specs also call the `e2e:reset` trapdoor in global setup, so
 * this is only needed when the data dir itself is broken.)
 */
if (process.env.E2E_RESET === "1" || process.env.CI) {
  rmSync(dataDir, { recursive: true, force: true })
  console.log("e2e: reset the local database")
}

mkdirSync(dataDir, { recursive: true })
writeFileSync(
  envFile,
  [
    "# Generated by scripts/e2e-backend.ts — do not edit, do not commit.",
    `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:${PORT}`,
    `CONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}`,
    `CONVEX_URL=http://127.0.0.1:${PORT}`,
    `CONVEX_SITE_URL=http://127.0.0.1:${SITE_PORT}`,
    "",
  ].join("\n")
)

const child = spawn(
  binary,
  [
    "--port",
    String(PORT),
    "--site-proxy-port",
    String(SITE_PORT),
    "--instance-name",
    INSTANCE_NAME,
    "--instance-secret",
    INSTANCE_SECRET,
    "--local-storage",
    "storage",
    // Tests are not product usage; keep them out of Convex's telemetry.
    "--disable-beacon",
    "convex.sqlite3",
  ],
  { cwd: dataDir, stdio: "inherit" }
)

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child.kill(signal)
    process.exit(0)
  })
}
child.on("exit", (code) => process.exit(code ?? 0))
