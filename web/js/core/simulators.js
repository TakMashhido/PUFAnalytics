// PUF population simulators — mirrors pufanalytics/simulators.py, including the
// exact order in which random numbers are drawn, so seeds reproduce across languages.
import { PortableRNG } from './rng.js';
import { makeDataset } from './dataset.js';

export function arbiterFeatures(ch, n, k) {
  const phi = new Float64Array(n * (k + 1));
  for (let c = 0; c < n; c++) {
    let p = 1;
    for (let i = k - 1; i >= 0; i--) { p *= 1 - 2 * ch[c * k + i]; phi[c * (k + 1) + i] = p; }
    phi[c * (k + 1) + k] = 1;
  }
  return phi;
}
function schedule(conditions, nRepeats) {
  const conds = conditions && conditions.length ? conditions : [['nominal', 1]];
  const s = []; for (const [l, sc] of conds) for (let r = 0; r < nRepeats; r++) s.push([String(l), Number(sc)]);
  return s;
}

function simArbiter(rng, D, N, sched, { stages = 64, xor = 1, noise = 0.05 } = {}) {
  const k = stages | 0, X = xor | 0, M = sched.length;
  const ch = rng.bits(N * k);
  const phi = arbiterFeatures(ch, N, k);
  const w = rng.normals(D * X * (k + 1));
  const clean = new Float64Array(D * X * N);
  for (let d = 0; d < D; d++) for (let x = 0; x < X; x++) for (let c = 0; c < N; c++) {
    let s = 0; const wo = (d * X + x) * (k + 1), po = c * (k + 1);
    for (let i = 0; i <= k; i++) s += phi[po + i] * w[wo + i];
    clean[(d * X + x) * N + c] = s;
  }
  const out = [];
  for (let d = 0; d < D; d++) {
    const dev = [];
    for (let m = 0; m < M; m++) {
      const sc = noise * sched[m][1], r = new Uint8Array(N);
      for (let c = 0; c < N; c++) { let b = 0; for (let x = 0; x < X; x++) b ^= clean[(d * X + x) * N + c] + sc * rng.normal() > 0 ? 1 : 0; r[c] = b; }
      dev.push(r);
    }
    out.push(dev);
  }
  return { responses: out, challenges: ch, stages: k };
}
function simRO(rng, D, N, sched, { sigma_process = 1.0, noise = 0.1, gradient = 0.0, pairing = 'neighbor' } = {}) {
  const nRo = pairing === 'neighbor' ? N + 1 : 2 * N, M = sched.length;
  const z = rng.normals(D * nRo), freq = new Float64Array(D * nRo);
  for (let d = 0; d < D; d++) for (let i = 0; i < nRo; i++) freq[d * nRo + i] = z[d * nRo + i] * sigma_process + gradient * (i / Math.max(nRo - 1, 1));
  const out = [], meas = new Float64Array(nRo);
  for (let d = 0; d < D; d++) {
    const dev = [];
    for (let m = 0; m < M; m++) {
      const sc = noise * sched[m][1];
      for (let i = 0; i < nRo; i++) meas[i] = freq[d * nRo + i] + sc * rng.normal();
      const r = new Uint8Array(N);
      for (let b = 0; b < N; b++) r[b] = pairing === 'neighbor' ? (meas[b] > meas[b + 1] ? 1 : 0) : (meas[2 * b] > meas[2 * b + 1] ? 1 : 0);
      dev.push(r);
    }
    out.push(dev);
  }
  return { responses: out };
}
function simSRAM(rng, D, N, sched, { noise = 0.1, bias = 0.0 } = {}) {
  const sk = rng.normals(D * N), M = sched.length, out = [];
  for (let i = 0; i < sk.length; i++) sk[i] += bias;
  for (let d = 0; d < D; d++) {
    const dev = [];
    for (let m = 0; m < M; m++) { const sc = noise * sched[m][1], r = new Uint8Array(N); for (let i = 0; i < N; i++) r[i] = sk[d * N + i] + sc * rng.normal() > 0 ? 1 : 0; dev.push(r); }
    out.push(dev);
  }
  return { responses: out };
}
function simIdeal(rng, D, N, sched, { flip_prob = 0.02 } = {}) {
  const base = rng.bits(D * N), M = sched.length, out = [];
  for (let d = 0; d < D; d++) {
    const dev = [];
    for (let m = 0; m < M; m++) {
      const p = Math.min(flip_prob * sched[m][1], 0.5), r = new Uint8Array(N);
      for (let i = 0; i < N; i++) { const u = rng.random(); r[i] = base[d * N + i] ^ (m > 0 && u < p ? 1 : 0); }
      dev.push(r);
    }
    out.push(dev);
  }
  return { responses: out };
}
export const SIMULATORS = { arbiter: simArbiter, ro: simRO, sram: simSRAM, ideal: simIdeal };

export function simulate({ model = 'arbiter', n_devices = 20, n_bits = 128, n_repeats = 5, seed = 1, conditions = null, params = {} } = {}) {
  if (!SIMULATORS[model]) throw new Error(`Unknown model ${model}`);
  const rng = new PortableRNG(seed), sched = schedule(conditions, n_repeats | 0);
  const r = SIMULATORS[model](rng, n_devices | 0, n_bits | 0, sched, params);
  const labels = sched.map((s) => s[0]);
  return makeDataset(r.responses, {
    deviceIds: Array.from({ length: n_devices }, (_, i) => `D${i}`),
    conditions: Array.from({ length: n_devices }, () => labels.slice()),
    challenges: r.challenges || null, stages: r.stages || 0,
    name: `${model}-sim-seed${seed}`,
    metadata: { simulator: model, seed, n_repeats, conditions: conditions && conditions.length ? conditions : [['nominal', 1]], params },
  });
}
