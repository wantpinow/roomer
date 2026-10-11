// A small Levenberg–Marquardt solver for the handful of unknowns in a room
// shell (5 for a quad). Residuals are in millimetres; the Jacobian is taken
// by central differences, which is plenty accurate at this scale.

export type ResidualFn = (params: readonly number[]) => number[]

export interface LeastSquaresOptions {
  maxIterations?: number
  /** Stop once no parameter moves by more than this (mm). */
  stepTolerance?: number
}

export interface LeastSquaresResult {
  params: number[]
  residuals: number[]
  iterations: number
  converged: boolean
}

const sumOfSquares = (values: readonly number[]): number =>
  values.reduce((sum, v) => sum + v * v, 0)

function jacobian(
  f: ResidualFn,
  params: readonly number[],
  count: number
): number[][] {
  const rows = Array.from({ length: count }, () =>
    new Array<number>(params.length).fill(0)
  )
  params.forEach((value, j) => {
    const h = 1e-4 * Math.max(1, Math.abs(value))
    const plus = [...params]
    const minus = [...params]
    plus[j] = value + h
    minus[j] = value - h
    const fPlus = f(plus)
    const fMinus = f(minus)
    for (let i = 0; i < count; i++) {
      rows[i]![j] = (fPlus[i]! - fMinus[i]!) / (2 * h)
    }
  })
  return rows
}

/** Solve A x = b by Gaussian elimination with partial pivoting. */
export function solveLinear(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[]
): number[] | undefined {
  const n = rhs.length
  const a = matrix.map((row, i) => [...row, rhs[i]!])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row
    }
    if (Math.abs(a[pivot]![col]!) < 1e-14) return undefined
    ;[a[col], a[pivot]] = [a[pivot]!, a[col]!]
    const pivotRow = a[col]!
    for (let row = col + 1; row < n; row++) {
      const target = a[row]!
      const factor = target[col]! / pivotRow[col]!
      for (let k = col; k <= n; k++) target[k]! -= factor * pivotRow[k]!
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let row = n - 1; row >= 0; row--) {
    const r = a[row]!
    let sum = r[n]!
    for (let k = row + 1; k < n; k++) sum -= r[k]! * x[k]!
    x[row] = sum / r[row]!
  }
  return x
}

/** Minimise Σ residual² from `initial` (Levenberg–Marquardt). */
export function solveLeastSquares(
  f: ResidualFn,
  initial: readonly number[],
  options: LeastSquaresOptions = {}
): LeastSquaresResult {
  const maxIterations = options.maxIterations ?? 200
  const stepTolerance = options.stepTolerance ?? 1e-7
  const n = initial.length

  let params = [...initial]
  let residuals = f(params)
  let cost = sumOfSquares(residuals)
  let lambda = 1e-3
  let converged = false
  let iterations = 0

  while (iterations < maxIterations && !converged) {
    iterations++
    const j = jacobian(f, params, residuals.length)
    const jtj = Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) =>
        j.reduce((sum, row) => sum + row[r]! * row[c]!, 0)
      )
    )
    const gradient = Array.from({ length: n }, (_, r) =>
      j.reduce((sum, row, i) => sum + row[r]! * residuals[i]!, 0)
    )

    let improved = false
    while (!improved) {
      const damped = jtj.map((row, r) =>
        row.map((value, c) =>
          r === c ? value + lambda * Math.max(value, 1e-9) : value
        )
      )
      const step = solveLinear(
        damped,
        gradient.map((g) => -g)
      )
      if (step) {
        const candidate = params.map((p, i) => p + step[i]!)
        const candidateResiduals = f(candidate)
        const candidateCost = sumOfSquares(candidateResiduals)
        if (Number.isFinite(candidateCost) && candidateCost <= cost) {
          const moved = Math.max(...step.map(Math.abs))
          params = candidate
          residuals = candidateResiduals
          cost = candidateCost
          lambda = Math.max(lambda / 3, 1e-12)
          improved = true
          if (moved < stepTolerance) converged = true
          continue
        }
      }
      lambda *= 4
      if (lambda > 1e12) {
        // No downhill step left: we are at a (local) minimum.
        converged = true
        break
      }
    }
  }

  return { params, residuals, iterations, converged }
}
