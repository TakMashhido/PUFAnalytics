// Population-level PUF quality metrics — mirrors pufanalytics/quality.py.
import { reference, measurement } from './dataset.js';

export function uniformity(ds, ref) {
  const N = ds.nBits, D = ds.devices.length, o = new Float64Array(D);
  for (let d = 0; d < D; d++) { let s = 0; for (let i = 0; i < N; i++) s += ref[d * N + i]; o[d] = (s / N) * 100; }
  return o;
}
export function bitAliasing(ds, ref) {
  const N = ds.nBits, D = ds.devices.length, o = new Float64Array(N);
  for (let d = 0; d < D; d++) for (let i = 0; i < N; i++) o[i] += ref[d * N + i];
  for (let i = 0; i < N; i++) o[i] = (o[i] / D) * 100;
  return o;
}
/** Symmetric D×D inter-device HD matrix (Int32Array, row-major). Uses 32-bit packing for speed. */
export function interHdMatrix(ds, ref) {
  const N = ds.nBits, D = ds.devices.length, W = Math.ceil(N / 32);
  const packed = new Uint32Array(D * W);
  for (let d = 0; d < D; d++) for (let i = 0; i < N; i++) if (ref[d * N + i]) packed[d * W + (i >> 5)] |= 1 << (i & 31);
  const pc = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24); };
  const m = new Int32Array(D * D);
  for (let a = 0; a < D; a++) for (let b = a + 1; b < D; b++) {
    let s = 0; for (let w = 0; w < W; w++) s += pc(packed[a * W + w] ^ packed[b * W + w]);
    m[a * D + b] = s; m[b * D + a] = s;
  }
  return m;
}
export function upperTriangle(m, D) { const o = []; for (let a = 0; a < D; a++) for (let b = a + 1; b < D; b++) o.push(m[a * D + b]); return o; }

function golden(ds, d) {
  const N = ds.nBits, R = ds.nMeas[d], arr = ds.devices[d], g = new Uint8Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let m = 0; m < R; m++) s += arr[m * N + i]; g[i] = 2 * s >= R ? 1 : 0; }
  return g;
}
/** Per device: array of intra HD vs reference. */
export function intraHd(ds, method = 'first') {
  const N = ds.nBits;
  return ds.devices.map((arr, d) => {
    const R = ds.nMeas[d];
    const ref = method === 'first' ? measurement(ds, d, 0) : golden(ds, d);
    const start = method === 'first' ? 1 : 0, out = [];
    for (let m = start; m < R; m++) { let s = 0; for (let i = 0; i < N; i++) s += arr[m * N + i] !== ref[i] ? 1 : 0; out.push(s); }
    return out;
  });
}
export function reliability(ds, intra) {
  return Float64Array.from(intra.map((h) => (h.length ? 100 - (h.reduce((a, b) => a + b, 0) / h.length / ds.nBits) * 100 : NaN)));
}
export function steadiness(ds) {
  const N = ds.nBits;
  return Float64Array.from(ds.devices.map((arr, d) => {
    const R = ds.nMeas[d]; if (R < 2) return NaN;
    let s = 0;
    for (let i = 0; i < N; i++) { let c = 0; for (let m = 0; m < R; m++) c += arr[m * N + i]; const p = c / R; s += Math.log2(Math.max(p, 1 - p)); }
    return 100 * (1 + s / N);
  }));
}
export function bitFlipRate(ds, method = 'first') {
  const N = ds.nBits, err = new Float64Array(N); let total = 0;
  ds.devices.forEach((arr, d) => {
    const R = ds.nMeas[d], ref = method === 'first' ? measurement(ds, d, 0) : golden(ds, d), start = method === 'first' ? 1 : 0;
    for (let m = start; m < R; m++) { for (let i = 0; i < N; i++) if (arr[m * N + i] !== ref[i]) err[i]++; total++; }
  });
  for (let i = 0; i < N; i++) err[i] = total ? err[i] / total : NaN;
  return err;
}
export function stableBitRatio(ds) {
  const N = ds.nBits; let stable = 0, cells = 0;
  ds.devices.forEach((arr, d) => {
    const R = ds.nMeas[d]; if (R < 2) return;
    for (let i = 0; i < N; i++) { let ok = 1; for (let m = 1; m < R; m++) if (arr[m * N + i] !== arr[i]) { ok = 0; break; } stable += ok; }
    cells += N;
  });
  return cells ? stable / cells : NaN;
}
export function conditionBer(ds) {
  const N = ds.nBits, acc = new Map();
  ds.devices.forEach((arr, d) => {
    for (let m = 1; m < ds.nMeas[d]; m++) {
      const c = ds.conditions[d][m]; if (!acc.has(c)) acc.set(c, [0, 0]);
      const e = acc.get(c); let s = 0; for (let i = 0; i < N; i++) s += arr[m * N + i] !== arr[i] ? 1 : 0;
      e[0] += s; e[1]++;
    }
  });
  const o = {}; for (const [c, [s, n]] of acc) o[c] = { ber: s / (n * N), n }; return o;
}
export function hammingWeights(ds, ref) {
  const N = ds.nBits, D = ds.devices.length, o = [];
  for (let d = 0; d < D; d++) { let s = 0; for (let i = 0; i < N; i++) s += ref[d * N + i]; o.push(s); }
  return o;
}
export function bitCorrelationMatrix(ds, ref, maxBits = 64) {
  const N = ds.nBits, D = ds.devices.length, B = Math.min(maxBits, N);
  const mu = new Float64Array(B);
  for (let d = 0; d < D; d++) for (let i = 0; i < B; i++) mu[i] += ref[d * N + i];
  for (let i = 0; i < B; i++) mu[i] /= D;
  const sd = new Float64Array(B);
  for (let i = 0; i < B; i++) { let s = 0; for (let d = 0; d < D; d++) s += (ref[d * N + i] - mu[i]) ** 2; sd[i] = Math.sqrt(s); }
  const c = [];
  for (let i = 0; i < B; i++) {
    const row = [];
    for (let j = 0; j < B; j++) {
      let s = 0; for (let d = 0; d < D; d++) s += (ref[d * N + i] - mu[i]) * (ref[d * N + j] - mu[j]);
      const den = sd[i] * sd[j]; row.push(den > 0 ? s / den : null);
    }
    c.push(row);
  }
  return c;
}
export function autocorrelation(ds, ref, maxLag = 32) {
  const N = ds.nBits, D = ds.devices.length, L = Math.min(maxLag, N - 1), o = [];
  for (let lag = 1; lag <= L; lag++) {
    let acc = 0;
    for (let d = 0; d < D; d++) { let s = 0; for (let i = 0; i < N - lag; i++) s += (2 * ref[d * N + i] - 1) * (2 * ref[d * N + i + lag] - 1); acc += s / (N - lag); }
    o.push(acc / D);
  }
  return o;
}
export function bitEntropy(ds, ref) {
  const p = bitAliasing(ds, ref).map((x) => x / 100);
  return Float64Array.from(p, (q) => -((q > 0 ? q * Math.log2(q) : 0) + (q < 1 ? (1 - q) * Math.log2(1 - q) : 0)));
}
export function bitMinEntropy(ds, ref) {
  const p = bitAliasing(ds, ref).map((x) => x / 100);
  return Float64Array.from(p, (q) => -Math.log2(Math.max(q, 1 - q)));
}
export { reference };
