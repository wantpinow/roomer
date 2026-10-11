/**
 * ESLint rule: require-cached-convex-query
 *
 * Every Convex query hook on the frontend must come from
 * `convex-helpers/react/cache`, never from `convex/react`. The cached hooks
 * keep a subscription alive for a while after the last component using it
 * unmounts, so navigating back to a screen renders its data instantly instead
 * of flashing a loading state. Both apps mount `ConvexQueryCacheProvider` at
 * the root, so the cached hooks are always available.
 *
 * Forbidden from `convex/react`: `useQuery`, `usePaginatedQuery`, `useQueries`.
 * Everything else that module exports — `useMutation`, `useAction`,
 * `useConvex`, `useConvexAuth`, `ConvexReactClient`, … — has no cached
 * counterpart and stays where it is.
 *
 * The fixer rewrites the import: the query hooks move to a
 * `convex-helpers/react/cache` import (merged into an existing one when the
 * file already has it) and the remaining specifiers stay on `convex/react`.
 */

const CONVEX_REACT = "convex/react"
const CACHE_MODULE = "convex-helpers/react/cache"
const QUERY_HOOKS = new Set(["useQuery", "usePaginatedQuery", "useQueries"])

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require Convex query hooks to be imported from `convex-helpers/react/cache` rather than `convex/react`",
    },
    fixable: "code",
    messages: {
      uncachedQueryHook:
        "Import `{{name}}` from `convex-helpers/react/cache`, not `convex/react`. The cached hook keeps the subscription warm across navigation so the screen never flashes a loading state; the raw hook drops it on unmount.",
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CONVEX_REACT) return

        const offending = node.specifiers.filter(
          (spec) =>
            spec.type === "ImportSpecifier" &&
            spec.imported.type === "Identifier" &&
            QUERY_HOOKS.has(spec.imported.name)
        )
        if (offending.length === 0) return

        const kept = node.specifiers.filter((spec) => !offending.includes(spec))

        // One report per hook so each shows up on its own line in the editor;
        // only the first carries the fixer, which rewrites the whole
        // declaration at once.
        offending.forEach((spec, index) => {
          context.report({
            node: spec,
            messageId: "uncachedQueryHook",
            data: { name: spec.imported.name },
            fix:
              index === 0
                ? (fixer) => buildFix(fixer, node, offending, kept, sourceCode)
                : null,
          })
        })
      },
    }
  },
}

/**
 * @param {import("eslint").Rule.RuleFixer} fixer
 * @param {import("estree").ImportDeclaration} node
 * @param {import("estree").ImportSpecifier[]} offending
 * @param {import("estree").ImportDeclaration["specifiers"]} kept
 * @param {import("eslint").SourceCode} sourceCode
 */
function buildFix(fixer, node, offending, kept, sourceCode) {
  const quote = node.source.raw[0] === "'" ? "'" : '"'
  const semicolon = sourceCode.getText(node).trimEnd().endsWith(";") ? ";" : ""
  const movedText = offending.map((spec) => sourceCode.getText(spec))

  const program = sourceCode.ast
  const existingCacheImport = program.body.find(
    (statement) =>
      statement.type === "ImportDeclaration" &&
      statement.source.value === CACHE_MODULE &&
      statement.importKind !== "type" &&
      statement.specifiers.every((spec) => spec.type === "ImportSpecifier")
  )

  const fixes = []

  if (kept.length === 0) {
    if (existingCacheImport) {
      fixes.push(fixer.remove(node))
    } else {
      fixes.push(
        fixer.replaceText(
          node,
          `import { ${movedText.join(", ")} } from ${quote}${CACHE_MODULE}${quote}${semicolon}`
        )
      )
    }
  } else {
    const defaultOrNamespace = kept.filter(
      (spec) => spec.type !== "ImportSpecifier"
    )
    const named = kept.filter((spec) => spec.type === "ImportSpecifier")
    const clause = [
      ...defaultOrNamespace.map((spec) => sourceCode.getText(spec)),
      ...(named.length > 0
        ? [`{ ${named.map((spec) => sourceCode.getText(spec)).join(", ")} }`]
        : []),
    ].join(", ")
    fixes.push(
      fixer.replaceText(
        node,
        `import ${clause} from ${quote}${CONVEX_REACT}${quote}${semicolon}` +
          (existingCacheImport
            ? ""
            : `\nimport { ${movedText.join(", ")} } from ${quote}${CACHE_MODULE}${quote}${semicolon}`)
      )
    )
  }

  if (existingCacheImport) {
    const present = new Set(
      existingCacheImport.specifiers.map((spec) => spec.imported.name)
    )
    const additions = offending
      .filter((spec) => !present.has(spec.imported.name))
      .map((spec) => sourceCode.getText(spec))
    if (additions.length > 0) {
      const last =
        existingCacheImport.specifiers[
          existingCacheImport.specifiers.length - 1
        ]
      fixes.push(fixer.insertTextAfter(last, `, ${additions.join(", ")}`))
    }
  }

  return fixes
}
