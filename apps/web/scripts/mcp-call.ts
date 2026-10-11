/**
 * `pnpm mcp <tool> '<json args>'` — call a tool on the running Roomer MCP
 * server (http://localhost:3000/api/mcp/mcp) and print the result.
 *
 * Placeholder: the MCP milestone (architecture §5, "Dev tooling for agents")
 * implements it with @modelcontextprotocol/client — text content is printed,
 * image content is written to .roomer-out/<timestamp>-<tool>-<n>.png and the
 * paths printed.
 */
const [tool, rawArgs] = process.argv.slice(2)

console.log(
  [
    "usage: pnpm mcp <tool> '<json args>'",
    "",
    '  e.g. pnpm mcp render_plan \'{"layoutId":"…","includePlan":true}\'',
    "",
    "Not implemented yet — the MCP server lands in a later milestone.",
    tool
      ? `(asked for tool "${tool}"${rawArgs ? ` with ${rawArgs}` : ""})`
      : "",
  ]
    .filter((line, i, all) => line !== "" || i < all.length - 1)
    .join("\n")
)
