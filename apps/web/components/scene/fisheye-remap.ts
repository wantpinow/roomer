import {
  type Color,
  DataTexture,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three"

import type { FisheyePlan } from "@/lib/scene/fisheye"

// The second half of a fisheye render: the canvas holds the wide
// rectilinear source (see lib/scene/fisheye.ts); this reads it back, remaps
// every output pixel to the source pixel its stereographic ray hits, and
// returns the result as a PNG data URL. Exact mode (id and depth passes)
// takes one nearest-neighbour sample per pixel so palette colours survive
// byte for byte; otherwise nine bilinear samples per pixel smooth the
// remap's stretch and squeeze.

const VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
uniform vec2 uOutput;
uniform float uFocal;
uniform vec2 uTan;
uniform vec3 uBackground;
uniform float uTaps;

vec3 sampleAt(vec2 px) {
  vec2 d = px - 0.5 * uOutput;
  float r = length(d);
  float theta = 2.0 * atan(r / (2.0 * uFocal));
  if (theta >= 1.5707) return uBackground;
  vec2 t = r > 0.0 ? (tan(theta) / r) * d : vec2(0.0);
  vec2 uv = 0.5 + 0.5 * t / uTan;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return uBackground;
  return texture2D(tSource, uv).rgb;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  if (uTaps < 1.5) {
    gl_FragColor = vec4(sampleAt(px), 1.0);
    return;
  }
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 3; j++) {
      sum += sampleAt(px + (vec2(float(i), float(j)) - 1.0) / 3.0);
    }
  }
  gl_FragColor = vec4(sum / 9.0, 1.0);
}
`

/** Reads the drawn canvas (the source) and returns the fisheye PNG. */
export function remapToFisheye(
  gl: WebGLRenderer,
  plan: FisheyePlan,
  { exact, background }: { exact: boolean; background: Color }
): string {
  const context = gl.getContext()
  gl.setRenderTarget(null)
  const sw = context.drawingBufferWidth
  const sh = context.drawingBufferHeight
  const pixels = new Uint8Array(sw * sh * 4)
  context.readPixels(0, 0, sw, sh, context.RGBA, context.UNSIGNED_BYTE, pixels)

  const source = new DataTexture(pixels, sw, sh, RGBAFormat, UnsignedByteType)
  source.minFilter = exact ? NearestFilter : LinearFilter
  source.magFilter = exact ? NearestFilter : LinearFilter
  source.generateMipmaps = false
  source.needsUpdate = true

  const { width, height } = plan
  const target = new WebGLRenderTarget(width, height, { depthBuffer: false })
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      tSource: { value: source },
      uOutput: { value: new Vector2(width, height) },
      uFocal: { value: plan.focal },
      uTan: { value: new Vector2(plan.tanHalfH, plan.tanHalfV) },
      uBackground: { value: background },
      uTaps: { value: exact ? 1 : 9 },
    },
    depthTest: false,
    depthWrite: false,
  })
  const geometry = new PlaneGeometry(2, 2)
  const quad = new Mesh(geometry, material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)

  const out = new Uint8Array(width * height * 4)
  try {
    gl.setRenderTarget(target)
    gl.render(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1))
    gl.readRenderTargetPixels(target, 0, 0, width, height, out)
  } finally {
    gl.setRenderTarget(null)
    source.dispose()
    target.dispose()
    material.dispose()
    geometry.dispose()
  }

  // GL rows run bottom-up; images top-down.
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context2d = canvas.getContext("2d")
  if (!context2d) throw new Error("No 2D canvas to encode the fisheye PNG")
  const image = context2d.createImageData(width, height)
  const row = width * 4
  for (let y = 0; y < height; y++) {
    image.data.set(
      out.subarray((height - 1 - y) * row, (height - y) * row),
      y * row
    )
  }
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255
  context2d.putImageData(image, 0, 0)
  return canvas.toDataURL("image/png")
}
