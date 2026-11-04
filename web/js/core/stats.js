// Statistical utilities — mirrors pufanalytics/stats.py.
import { PortableRNG } from './rng.js';

const EPS = 1e-15, FPMIN = 1e-300;
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

const LOGFACT = [0, 0];
function logFactorial(n) {
  while (LOGFACT.length <= n) LOGFACT.push(LOGFACT[LOGFACT.length - 1] + Math.log(LOGFACT.length));
  return LOGFACT[n];
}

export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  if (Number.isInteger(x) && x <= 100000) return logFactorial(x - 1);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function gser(a, x) {
  const gln = lgamma(a);
  let ap = a, del = 1 / a, sum = del;
  for (let i = 0; i < 10000; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * EPS) break; }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}
function gcf(a, x) {
  const gln = lgamma(a);
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}
export function igam(a, x) { if (x <= 0) return 0; return x < a + 1 ? gser(a, x) : 1 - gcf(a, x); }
export function igamc(a, x) { if (x <= 0) return 1; return x < a + 1 ? 1 - gser(a, x) : gcf(a, x); }
export function erfc(x) { return x >= 0 ? igamc(0.5, x * x) : 2 - igamc(0.5, x * x); }
export function normalCdf(x) { return 0.5 * erfc(-x / Math.SQRT2); }

// ---------------------------------------------------------------- binomial
export function binomLogPmf(k, n, p) {
  if (k < 0 || k > n) return -Infinity;
  if (p <= 0) return k === 0 ? 0 : -Infinity;
  if (p >= 1) return k === n ? 0 : -Infinity;
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log1p(-p);
}
export function binomPmfVector(n, p) { const o = new Float64Array(n + 1); for (let k = 0; k <= n; k++) o[k] = Math.exp(binomLogPmf(k, n, p)); return o; }
function logSumExp(v) {
  const f = v.filter((x) => x !== -Infinity); if (!f.length) return -Infinity;
  const m = Math.max(...f); let s = 0; for (const x of f) s += Math.exp(x - m); return m + Math.log(s);
}
function tails(k, n, p) {
  const lo = [], hi = [];
  for (let i = 0; i <= n; i++) (i <= k ? lo : hi).push(binomLogPmf(i, n, p));
  return [logSumExp(lo), logSumExp(hi)];
}
export function binomCdf(k, n, p) {
  if (k < 0) return 0; if (k >= n) return 1;
  const [lo, hi] = tails(k, n, p); return lo < hi ? Math.exp(lo) : -Math.expm1(hi);
}
export function binomSf(k, n, p) {
  if (k < 0) return 1; if (k >= n) return 0;
  const [lo, hi] = tails(k, n, p); return hi < lo ? Math.exp(hi) : -Math.expm1(lo);
}

// ---------------------------------------------------------------- descriptive
export function mean(x) { let s = 0, c = 0; for (const v of x) if (!Number.isNaN(v)) { s += v; c++; } return c ? s / c : NaN; }
export function std(x) {
  const f = Array.from(x).filter((v) => !Number.isNaN(v)); if (f.length < 2) return NaN;
  const m = mean(f); let s = 0; for (const v of f) s += (v - m) ** 2; return Math.sqrt(s / (f.length - 1));
}
export function variance0(x) { const m = mean(x); let s = 0; for (const v of x) s += (v - m) ** 2; return s / x.length; }
export function quantile(sorted, p) {
  const n = sorted.length; if (!n) return NaN;
  const h = (n - 1) * p, lo = Math.floor(h), hi = Math.min(lo + 1, n - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
export function percentileCi(samples, alpha = 0.05) {
  const s = Array.from(samples).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  if (!s.length) return [NaN, NaN];
  return [quantile(s, alpha / 2), quantile(s, 1 - alpha / 2)];
}
export function summary(x) {
  const f = Array.from(x).filter((v) => !Number.isNaN(v));
  return { mean: mean(f), std: std(f), min: f.length ? Math.min(...f) : NaN, max: f.length ? Math.max(...f) : NaN };
}

// ---------------------------------------------------------- identification
export function histogramCounts(values, nBits) {
  const h = new Array(nBits + 1).fill(0); for (const v of values) if (v >= 0 && v <= nBits) h[v]++; return h;
}
export function decidability(intra, inter) {
  if (!intra.length || !inter.length) return NaN;
  const denom = Math.sqrt((variance0(intra) + variance0(inter)) / 2);
  const d = Math.abs(mean(inter) - mean(intra));
  if (denom === 0) return d !== 0 ? Infinity : NaN;
  return d / denom;
}
export function farFrrCurve(intraHd, interHd, nBits) {
  const ic = histogramCounts(intraHd, nBits), ec = histogramCounts(interHd, nBits);
  const it = intraHd.length, et = interHd.length;
  const far = [], frr = [];
  let ci = 0, ce = 0;
  for (let t = 0; t <= nBits; t++) {
    ci += ic[t]; ce += ec[t];
    frr.push(it ? Math.min(Math.max(1 - ci / it, 0), 1) : NaN);
    far.push(et ? ce / et : NaN);
  }
  return { far, frr };
}
export function equalErrorRate(far, frr) {
  let best = Infinity, idx = -1;
  for (let i = 0; i < far.length; i++) { const w = Math.max(far[i], frr[i]); if (w < best) { best = w; idx = i; } }
  return idx < 0 ? [NaN, -1] : [(far[idx] + frr[idx]) / 2, idx];
}
export function binomialFit(hd, nBits) {
  if (!hd.length) return { p: NaN, chi2: NaN, dof: 0, p_value: NaN };
  const p = mean(hd) / nBits;
  const obs = histogramCounts(hd, nBits), exp = binomPmfVector(nBits, p);
  let chi2 = 0, bins = 0;
  for (let k = 0; k <= nBits; k++) { const e = exp[k] * hd.length; if (e >= 5) { chi2 += (obs[k] - e) ** 2 / e; bins++; } }
  if (!bins) chi2 = NaN;
  const dof = Math.max(bins - 2, 0);
  const pv = dof > 0 && !Number.isNaN(chi2) ? igamc(dof / 2, chi2 / 2) : NaN;
  return { p, chi2, dof, p_value: pv };
}
// log of P(X<=t) and P(X>t) for all t, via cumulative log-sum-exp (O(n)).
function logTails(n, p) {
  const lp = new Float64Array(n + 1); for (let k = 0; k <= n; k++) lp[k] = binomLogPmf(k, n, p);
  const lae = (a, b) => (a === -Infinity ? b : b === -Infinity ? a : Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b))));
  const lo = new Float64Array(n + 1), hi = new Float64Array(n + 1);
  let acc = -Infinity; for (let k = 0; k <= n; k++) { acc = lae(acc, lp[k]); lo[k] = acc; }
  acc = -Infinity; for (let k = n; k >= 0; k--) { hi[k] = acc; acc = lae(acc, lp[k]); }
  return { lo, hi };
}
export function binomialFarFrr(nBits, pIntra, pInter) {
  const A = logTails(nBits, pInter), R = logTails(nBits, pIntra);
  const far = [], frr = [];
  for (let t = 0; t <= nBits; t++) {
    far.push(t >= nBits ? 1 : A.lo[t] < A.hi[t] ? Math.exp(A.lo[t]) : -Math.expm1(A.hi[t]));
    frr.push(t >= nBits ? 0 : R.hi[t] < R.lo[t] ? Math.exp(R.hi[t]) : -Math.expm1(R.lo[t]));
  }
  let idx = 0, best = Infinity;
  for (let t = 0; t <= nBits; t++) { const w = Math.max(far[t], frr[t]); if (w < best) { best = w; idx = t; } }
  return { far, frr, threshold: idx, far_at_threshold: far[idx], frr_at_threshold: frr[idx] };
}
export function bootstrapIndices(n, B, seed = 0) {
  const rng = new PortableRNG(seed); const out = [];
  for (let b = 0; b < B; b++) { const r = new Int32Array(n); for (let i = 0; i < n; i++) r[i] = rng.randint(n); out.push(r); }
  return out;
}

export function identificationVsLength(pIntra, pInter, lengths) {
  return { lengths, error: lengths.map((n) => { const m = binomialFarFrr(n, Math.max(pIntra, 1e-12), pInter); return Math.max(m.far_at_threshold, m.frr_at_threshold); }) };
}
