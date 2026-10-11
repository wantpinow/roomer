"use client"

import dynamic from "next/dynamic"

// three.js and WebGL only exist in the browser, so the runner never renders
// on the server.
const RenderRunner = dynamic(
  () => import("./render-runner").then((m) => m.RenderRunner),
  { ssr: false }
)

export function RenderHost() {
  return <RenderRunner />
}
