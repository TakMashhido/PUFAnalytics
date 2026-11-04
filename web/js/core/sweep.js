// Monte-Carlo parameter sweeps — mirrors pufanalytics/sweep.py.
import { simulate } from './simulators.js';
import { reference } from './dataset.js';
import * as Q from './quality.js';
import * as S from './stats.js';

export const METRICS = [
  ['uniformity', 'Uniformity (%)'], ['bit_aliasing_std', 'Bit-aliasing σ (%)'], ['uniqueness', 'Uniqueness (%)'],
  ['reliability', 'Reliability (%)'], ['min_entropy', 'Min-entropy / bit'], ['decidability', "Decidability d'"], ['log10_error', 'log10 identification error'],
];
export const BASE_PARAMS = ['n_devices', 'n_bits', 'n_repeats'];
const INT_PARAMS = ['stages', 'xor', 'loops', 'x', 'y'];

export function quickMetrics(ds) {
  const N = ds.nBits, ref = reference(ds, 'first'), o = Object.fromEntries(METRICS.map(([k]) => [k, NaN]));
  let s = 0; for (const b of ref) s += b; o.uniformity = (s / ref.length) * 100;
  const ba = Q.bitAliasing(ds, ref); o.bit_aliasing_std = N > 1 ? S.std(ba) : NaN;
  o.min_entropy = S.mean(Q.bitMinEntropy(ds, ref));
  const D = ds.devices.length, inter = D > 1 ? Q.upperTriangle(Q.interHdMatrix(ds, ref), D) : [];
  if (inter.length) o.uniqueness = (S.mean(inter) / N) * 100;
  const intra = Q.intraHd(ds, 'first').flat();
  if (intra.length) o.reliability = 100 - (S.mean(intra) / N) * 100;
  if (intra.length && inter.length) {
    o.decidability = S.decidability(intra.map((v) => v / N), inter.map((v) => v / N));
    const m = S.binomialFarFrr(N, Math.max(S.mean(intra) / N, 1e-12), S.mean(inter) / N);
    o.log10_error = Math.log10(Math.max(Math.max(m.far_at_threshold, m.frr_at_threshold), 1e-300));
  }
  return o;
}

export function sweep({ model = 'arbiter', param = 'noise', values = [0.01, 0.05, 0.1], param2 = null, values2 = null, seeds = 5, seed = 1, n_devices = 20, n_bits = 128, n_repeats = 4, conditions = null, params = {} } = {}, onProgress) {
  const v2 = param2 ? values2 : [null], keys = METRICS.map(([k]) => k);
  const mean = Object.fromEntries(keys.map((k) => [k, v2.map(() => values.map(() => NaN))]));
  const sd = Object.fromEntries(keys.map((k) => [k, v2.map(() => values.map(() => NaN))]));
  const total = v2.length * values.length; let done = 0;
  v2.forEach((b, j) => values.forEach((a, i) => {
    const reps = Object.fromEntries(keys.map((k) => [k, []]));
    for (let r = 0; r < seeds; r++) {
      const cfg = { n_devices, n_bits, n_repeats }, kw = { ...params };
      for (const [name, val] of [[param, a], [param2, b]]) {
        if (!name) continue;
        if (BASE_PARAMS.includes(name)) cfg[name] = Math.floor(val + 0.5);
        else if (INT_PARAMS.includes(name)) kw[name] = Math.floor(val + 0.5);
        else kw[name] = val;
      }
      const ds = simulate({ model, ...cfg, seed: seed + r, conditions, params: kw });
      const q = quickMetrics(ds); for (const k of keys) reps[k].push(q[k]);
    }
    for (const k of keys) {
      const x = reps[k].filter((v) => !Number.isNaN(v));
      if (x.length) { mean[k][j][i] = S.mean(x); sd[k][j][i] = x.length > 1 ? S.std(x) : 0; }
    }
    onProgress && onProgress(++done / total);
  }));
  return { model, param, values, param2, values2: param2 ? values2 : null, seeds, seed, mean, std: sd };
}
