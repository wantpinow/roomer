import { degToRad } from "./angles"

// 3D rotations for asset parts. Part rotations are degrees about local x, y
// and z applied in X → Y → Z order — three.js Euler order "XYZ", whose
// matrix is Rx · Ry · Rz (so a vector is effectively rotated about z first,
// then y, then x, in the fixed frame).

export type Tuple3 = [number, number, number]

/** Row-major 3×3 matrix. */
export type Matrix3 = [Tuple3, Tuple3, Tuple3]

/** Rotation matrix for three.js Euler "XYZ" angles given in degrees. */
export function eulerXYZMatrix([rx, ry, rz]: readonly [
  number,
  number,
  number,
]): Matrix3 {
  const a = Math.cos(degToRad(rx))
  const b = Math.sin(degToRad(rx))
  const c = Math.cos(degToRad(ry))
  const d = Math.sin(degToRad(ry))
  const e = Math.cos(degToRad(rz))
  const f = Math.sin(degToRad(rz))
  // Same expansion as three.js Matrix4.makeRotationFromEuler for "XYZ".
  return [
    [c * e, -c * f, d],
    [a * f + b * e * d, a * e - b * f * d, -b * c],
    [b * f - a * e * d, b * e + a * f * d, a * c],
  ]
}

export function applyMatrix3(
  m: Matrix3,
  [x, y, z]: readonly [number, number, number]
): Tuple3 {
  return [
    m[0][0] * x + m[0][1] * y + m[0][2] * z,
    m[1][0] * x + m[1][1] * y + m[1][2] * z,
    m[2][0] * x + m[2][1] * y + m[2][2] * z,
  ]
}

/** Rotate a point by three.js Euler "XYZ" angles in degrees. */
export function rotateEulerXYZ(
  point: readonly [number, number, number],
  rotationDeg: readonly [number, number, number]
): Tuple3 {
  return applyMatrix3(eulerXYZMatrix(rotationDeg), point)
}
