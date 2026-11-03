// Logistic-regression modelling attack — mirrors pufanalytics/attacks.py.
import { PortableRNG } from './rng.js';
import { arbiterFeatures } from './simulators.js';

const sigmoid = (z) => 0.5 * (1 + Math.tanh(0.5 * z));

function choleskySolve(H, g, d) {
  const L = new Float64Array(d * d);
  for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++) {
    let s = H[i * d + j]; for (let k = 0; k < j; k++) s -= L[i * d + k] * L[j * d + k];
    L[i * d + j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j * d + j];
  }
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) { let s = g[i]; for (let k = 0; k < i; k++) s -= L[i * d + k] * y[k]; y[i] = s / L[i * d + i]; }
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < d; k++) s -= L[k * d + i] * x[k]; x[i] = s / L[i * d + i]; }
  return x;
}

/** X: Float64Array(n*d) row-major, y: 0/1 */
export function logisticRegression(X, y, n, d, l2 = 1e-2, maxIter = 30, tol = 1e-6) {
  const w = new Float64Array(d);
  for (let it = 0; it < maxIter; it++) {
    const g = new Float64Array(d), H = new Float64Array(d * d);
    for (let r = 0; r < n; r++) {
      let z = 0; const o = r * d; for (let j = 0; j < d; j++) z += X[o + j] * w[j];
      const p = sigmoid(z), e = p - y[r], s = p * (1 - p);
      for (let i = 0; i < d; i++) { const xi = X[o + i]; g[i] += xi * e; const sx = s * xi; for (let j = 0; j <= i; j++) H[i * d + j] += sx * X[o + j]; }
    }
    for (let i = 0; i < d; i++) { g[i] += l2 * w[i]; H[i * d + i] += l2; for (let j = 0; j < i; j++) H[j * d + i] = H[i * d + j]; }
    const step = choleskySolve(H, g, d);
    let mx = 0; for (let i = 0; i < d; i++) { w[i] -= step[i]; mx = Math.max(mx, Math.abs(step[i])); }
    if (mx < tol) break;
  }
  return w;
}
function accuracy(X, y, w, from, to, d) {
  let ok = 0;
  for (let r = from; r < to; r++) { let z = 0; for (let j = 0; j < d; j++) z += X[r * d + j] * w[j]; if ((z > 0) === (y[r] > 0.5)) ok++; }
  return ok / (to - from);
}
function curve(phi, y, n, d, trainSizes, testSize, l2, onProgress) {
  testSize = Math.min(testSize, Math.floor(n / 2));
  const pool = n - testSize, sizes = [], tr = [], te = [];
  for (let i = 0; i < trainSizes.length; i++) {
    const m = Math.min(trainSizes[i] | 0, pool);
    if (m < 2 || (sizes.length && m === sizes[sizes.length - 1])) continue;
    const w = logisticRegression(phi, y, m, d, l2);
    tr.push(accuracy(phi, y, w, 0, m, d)); te.push(accuracy(phi, y, w, n - testSize, n, d)); sizes.push(m);
    onProgress && onProgress((i + 1) / trainSizes.length);
  }
  return { train_sizes: sizes, train_accuracy: tr, test_accuracy: te, test_size: testSize };
}
export function modelingAttack(challenges, responses, n, k, trainSizes, testSize = 1000, l2 = 1e-2, onProgress) {
  const phi = arbiterFeatures(challenges, n, k);
  return curve(phi, Float64Array.from(responses), n, k + 1, trainSizes, testSize, l2, onProgress);
}
export function simulatedAttack({ stages = 64, xor = 1, noise = 0.05, train_sizes = [50, 100, 200, 500, 1000, 2000, 5000], test_size = 2000, seed = 7, l2 = 1e-2 } = {}, onProgress) {
  const rng = new PortableRNG(seed), k = stages | 0, X = xor | 0;
  const n = Math.max(...train_sizes) + (test_size | 0);
  const w = rng.normals(X * (k + 1));
  const ch = rng.bits(n * k);
  const phi = arbiterFeatures(ch, n, k);
  const y = new Float64Array(n);
  for (let r = 0; r < n; r++) {
    let b = 0;
    for (let x = 0; x < X; x++) { let s = 0; for (let i = 0; i <= k; i++) s += phi[r * (k + 1) + i] * w[x * (k + 1) + i]; b ^= s + noise * rng.normal() > 0 ? 1 : 0; }
    y[r] = b;
  }
  const res = curve(phi, y, n, k + 1, train_sizes, test_size, l2, onProgress);
  return { ...res, stages: k, xor: X, noise, seed };
}
