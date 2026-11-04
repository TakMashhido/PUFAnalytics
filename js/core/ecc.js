// Fuzzy-extractor ECC / key-generation planner — mirrors pufanalytics/ecc.py.
import { binomSf } from './stats.js';

export const CODES = [
  ['None', 1, 1, 0], ['Hamming(7,4,1)', 7, 4, 1], ['Golay(23,12,3)', 23, 12, 3], ['Golay(24,12,3)', 24, 12, 3],
  ['RM(1,4)', 16, 5, 3], ['RM(1,5)', 32, 6, 7], ['RM(1,6)', 64, 7, 15], ['RM(1,7)', 128, 8, 31],
  ['BCH(15,7,2)', 15, 7, 2], ['BCH(31,16,3)', 31, 16, 3], ['BCH(63,30,6)', 63, 30, 6], ['BCH(63,16,11)', 63, 16, 11],
  ['BCH(127,64,10)', 127, 64, 10], ['BCH(127,36,15)', 127, 36, 15], ['BCH(255,131,18)', 255, 131, 18],
  ['BCH(255,63,30)', 255, 63, 30], ['BCH(255,21,55)', 255, 21, 55],
];
export const REPETITIONS = [1, 3, 5, 7, 9, 11, 15];
export const repetitionError = (p, r) => (r <= 1 ? p : binomSf(Math.floor(r / 2), r, p));
export const blockFailure = (p, n, t) => binomSf(t, n, p);

export function planKeyGeneration(ber, minEntropy = 1, keyBits = 128, target = 1e-6, codes = CODES, reps = REPETITIONS) {
  const out = [];
  for (const [name, n, k, t] of codes) for (const r of reps) {
    const pIn = repetitionError(ber, r), pb = blockFailure(pIn, n, t), bpb = n * r;
    const residual = bpb * minEntropy - (bpb - k);
    if (residual <= 0) { out.push({ code: name, n, k, t, repetition: r, blocks: null, puf_bits: null, helper_bits: null, failure: null, feasible: false, reason: 'helper data leaks all entropy' }); continue; }
    const blocks = Math.ceil(keyBits / residual);
    const fail = pb <= 0 ? 0 : pb < 1 ? -Math.expm1(blocks * Math.log1p(-pb)) : 1;
    out.push({ code: name, n, k, t, repetition: r, blocks, puf_bits: blocks * bpb, helper_bits: blocks * (bpb - k), residual_entropy: blocks * residual, inner_ber: pIn, block_failure: pb, failure: fail, feasible: fail <= target, reason: fail <= target ? '' : 'failure rate above target' });
  }
  out.sort((a, b) => (a.feasible === b.feasible ? (a.puf_bits ?? Infinity) - (b.puf_bits ?? Infinity) : a.feasible ? -1 : 1));
  return out;
}
