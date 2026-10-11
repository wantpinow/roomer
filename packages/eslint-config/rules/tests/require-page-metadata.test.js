import rule from "../require-page-metadata.js"
import { createRuleTester } from "./rule-tester.js"

const pageFile = "/repo/apps/web/app/rooms/[roomId]/page.tsx"

createRuleTester().run("require-page-metadata", rule, {
  valid: [
    {
      code: `export const metadata = { title: "Rooms" }
      export default function Page() { return null }`,
      filename: pageFile,
    },
    {
      code: `export async function generateMetadata() { return { title: "Room" } }
      export default function Page() { return null }`,
      filename: pageFile,
    },
    {
      code: `const metadata = { title: "Rooms" }
      export { metadata }
      export default function Page() { return null }`,
      filename: pageFile,
    },
    {
      // Only page files inside app/ are checked.
      code: `export default function Content() { return null }`,
      filename: "/repo/apps/web/app/rooms/_components/content.tsx",
    },
  ],
  invalid: [
    {
      code: `"use client"
      export default function Page() { return null }`,
      filename: pageFile,
      errors: [{ messageId: "missingMetadata" }],
    },
    {
      code: `export default function Page() { return null }`,
      filename: "/repo/apps/web/app/page.tsx",
      errors: [{ messageId: "missingMetadata" }],
    },
  ],
})
