/**
 * ESLint rule: require-page-metadata
 *
 * Enforces that Next.js App Router page files (page.tsx/page.ts)
 * export either `metadata` or `generateMetadata` to ensure every
 * page sets a title.
 */

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require page.tsx files to export `metadata` or `generateMetadata`",
    },
    messages: {
      missingMetadata:
        "Page files must export `metadata` or `generateMetadata` to set the page title. If this is a client component, extract the client code into a separate component and keep page.tsx as a server component.",
    },
    schema: [],
  },

  create(context) {
    const filename = context.filename || context.getFilename()

    // Only apply to page.tsx / page.ts files inside an app/ directory
    if (!/\/app\/(.*\/)?page\.(tsx?|jsx?)$/.test(filename)) {
      return {}
    }

    let hasMetadataExport = false

    return {
      // export const metadata = ...
      ExportNamedDeclaration(node) {
        if (node.declaration) {
          if (node.declaration.type === "VariableDeclaration") {
            for (const decl of node.declaration.declarations) {
              if (
                decl.id.type === "Identifier" &&
                (decl.id.name === "metadata" ||
                  decl.id.name === "generateMetadata")
              ) {
                hasMetadataExport = true
              }
            }
          }
          // export function generateMetadata() { ... }
          if (
            node.declaration.type === "FunctionDeclaration" &&
            node.declaration.id &&
            node.declaration.id.name === "generateMetadata"
          ) {
            hasMetadataExport = true
          }
        }

        // export { metadata } or export { generateMetadata }
        if (node.specifiers) {
          for (const spec of node.specifiers) {
            const exportedName =
              spec.exported.type === "Identifier"
                ? spec.exported.name
                : spec.exported.value
            if (
              exportedName === "metadata" ||
              exportedName === "generateMetadata"
            ) {
              hasMetadataExport = true
            }
          }
        }
      },

      "Program:exit"(node) {
        if (!hasMetadataExport) {
          context.report({
            node,
            messageId: "missingMetadata",
          })
        }
      },
    }
  },
}
