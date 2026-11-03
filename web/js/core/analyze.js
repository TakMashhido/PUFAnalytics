// One-call analysis — produces the same structure as pufanalytics.report.analyze().
import * as S from './stats.js';
import * as Q from './quality.js';
import * as E from './estimators.js';
import * as NIST from './nist.js';
import { reference, conditionLabels } from './dataset.js';

export const LZ_MAX_BITS = 16384; // LZ76 is quadratic; evaluated on the leading bits only

function bootstrap(ds, ref, interM, rel, B, seed, alpha) {
  const D = ds.devices.length, N = ds.nBits;
  if (B <= 0 || D < 3) return null;
  const idxs = S.bootstrapIndices(D, B, seed);
  const uf = Q.uniformity(ds, ref);
  const reps = { uniformity: [], uniqueness: [], reliability: [], bit_aliasing: [] };
  for (const s of idxs) {
    let u = 0; for (const i of s) u += uf[i]; reps.uniformity.push(u / D);
    reps.bit_aliasing.push(u / D); // mean bit-aliasing == mean uniformity over the same devices
    let rs = 0, rc = 0; for (const i of s) if (!Number.isNaN(rel[i])) { rs += rel[i]; rc++; }
    reps.reliability.push(rc ? rs / rc : NaN);
    let hs = 0, hc = 0;
    for (let a = 0; a < D; a++) for (let b = a + 1; b < D; b++) if (s[a] !== s[b]) { hs += interM[s[a] * D + s[b]]; hc++; }
    reps.uniqueness.push(hc ? (hs / hc / N) * 100 : NaN);
  }
  const o = {};
  for (const [k, v] of Object.entries(reps)) { const [lo, hi] = S.percentileCi(v, alpha); o[k] = { low: lo, high: hi }; }
  return o;
}

export function analyze(ds, { reference: method = 'first', bootstrap: B = 1000, seed = 12345, alpha = 0.05, nistAlpha = 0.01, runNist = true, maxCorrBits = 64, maxLag = 32 } = {}, onProgress = () => {}) {
  const N = ds.nBits, D = ds.devices.length;
  const ref = reference(ds, method);
  const total = ds.nMeas.reduce((a, b) => a + b, 0);
  const out = {
    meta: {
      name: ds.name, devices: D, bits: N, measurements_total: total,
      measurements_min: Math.min(...ds.nMeas), measurements_max: Math.max(...ds.nMeas),
      conditions: conditionLabels(ds), reference: method, generated: new Date().toISOString().replace(/\.\d+Z$/, '+00:00'),
      dataset_metadata: ds.metadata || {},
    },
  };
  onProgress(0.05, 'Uniformity & bit-aliasing');
  const uf = Q.uniformity(ds, ref), ba = Q.bitAliasing(ds, ref);
  out.uniformity = { ...S.summary(uf), per_device: Array.from(uf) };
  out.bit_aliasing = { ...S.summary(ba), per_bit: Array.from(ba) };

  onProgress(0.15, 'Inter-device distances');
  let interM = null, inter = [];
  if (D >= 2) {
    interM = Q.interHdMatrix(ds, ref); inter = Q.upperTriangle(interM, D);
    out.uniqueness = { mean: (S.mean(inter) / N) * 100, std: inter.length > 1 ? (S.std(inter) / N) * 100 : NaN, pairs: inter.length };
    out.inter_hd = { histogram: S.histogramCounts(inter, N), fit: S.binomialFit(inter, N) };
  }
  onProgress(0.3, 'Intra-device distances');
  const intraList = Q.intraHd(ds, method), intra = intraList.flat();
  let rel = new Float64Array(D).fill(NaN);
  if (intra.length) {
    rel = Q.reliability(ds, intraList);
    const st = Q.steadiness(ds), fr = Q.bitFlipRate(ds, method);
    out.reliability = { ...S.summary(rel), per_device: Array.from(rel) };
    out.steadiness = { ...S.summary(st), per_device: Array.from(st) };
    out.ber = { mean: S.mean(intra) / N, max: Math.max(...intra) / N, per_bit: Array.from(fr) };
    out.stable_bits = Q.stableBitRatio(ds);
    out.intra_hd = { histogram: S.histogramCounts(intra, N), fit: S.binomialFit(intra, N) };
    out.conditions = Q.conditionBer(ds);
  }
  onProgress(0.45, 'Identification statistics');
  if (intra.length && inter.length) {
    const c = S.farFrrCurve(intra, inter, N); const [eer, idx] = S.equalErrorRate(c.far, c.frr);
    const pIntra = Math.max(S.mean(intra) / N, 1e-12), pInter = S.mean(inter) / N;
    const m = S.binomialFarFrr(N, pIntra, pInter);
    out.identification = {
      decidability: S.decidability(intra.map((v) => v / N), inter.map((v) => v / N)), eer, eer_threshold: idx, far: c.far, frr: c.frr,
      binomial: { p_intra: pIntra, p_inter: pInter, threshold: m.threshold, far: m.far_at_threshold, frr: m.frr_at_threshold, far_curve: m.far, frr_curve: m.frr },
    };
  }
  onProgress(0.55, 'Entropy');
  const h = Q.bitEntropy(ds, ref), hm = Q.bitMinEntropy(ds, ref);
  out.entropy = {
    shannon_mean: S.mean(h), min_entropy_mean: S.mean(hm), shannon_per_bit: Array.from(h), min_entropy_per_bit: Array.from(hm),
    stream_shannon: E.shannonEntropyRate(ref), mcv_min_entropy: E.mcvMinEntropy(ref), markov_min_entropy: E.markovMinEntropy(ref),
    lz_complexity: E.lzComplexity(ref.subarray(0, LZ_MAX_BITS)), lz_bits: Math.min(ref.length, LZ_MAX_BITS),
  };
  onProgress(0.65, 'Correlation');
  const corr = Q.bitCorrelationMatrix(ds, ref, maxCorrBits);
  const off = []; corr.forEach((row, i) => row.forEach((v, j) => { if (i !== j && v !== null) off.push(Math.abs(v)); }));
  out.correlation = { matrix: corr, mean_abs: off.length ? S.mean(off) : NaN, max_abs: off.length ? Math.max(...off) : NaN, autocorrelation: Q.autocorrelation(ds, ref, maxLag) };
  const hw = Q.hammingWeights(ds, ref);
  out.hamming_weight = { values: hw, histogram: S.histogramCounts(hw, N) };
  if (runNist) { onProgress(0.75, 'NIST SP 800-22'); out.nist = { alpha: nistAlpha, n: ref.length, tests: NIST.runAll(ref, nistAlpha) }; }
  if (interM) {
    const mat = []; for (let a = 0; a < D; a++) { const r = []; for (let b = 0; b < D; b++) r.push(interM[a * D + b] / N); mat.push(r); }
    out.inter_hd_matrix = mat;
    onProgress(0.85, 'Bootstrap confidence intervals');
    const ci = bootstrap(ds, ref, interM, rel, B | 0, seed, alpha);
    if (ci) out.confidence_intervals = { level: 1 - alpha, resamples: B | 0, seed, ...ci };
  }
  onProgress(1, 'Done');
  return out;
}
