// NIST SP 800-22 rev. 1a tests — mirrors pufanalytics/nist.py.
import { igamc, erfc, normalCdf } from './stats.js';

function result(name, pv, statistic, n, alpha, applicable = true, note = '') {
  if (!applicable) return { name, p_value: null, p_values: [], statistic: null, passed: null, n, applicable: false, note };
  pv = pv.map((p) => Math.min(Math.max(p, 0), 1));
  const p = Math.min(...pv);
  return { name, p_value: p, p_values: pv, statistic, passed: p >= alpha, n, applicable: true, note };
}
const sum = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; return s; };

export function monobit(x, alpha = 0.01, strict = true) {
  const n = x.length;
  if (strict && n < 100) return result('Frequency (monobit)', [], null, n, alpha, false, 'requires n >= 100');
  const s = Math.abs(2 * sum(x) - n) / Math.sqrt(n);
  return result('Frequency (monobit)', [erfc(s / Math.SQRT2)], s, n, alpha);
}
export function blockFrequency(x, alpha = 0.01, blockSize = null, strict = true) {
  const n = x.length;
  if (strict && n < 100) return result('Block frequency', [], null, n, alpha, false, 'requires n >= 100');
  const M = blockSize || Math.max(20, Math.min(128, Math.floor(n / 100)));
  const N = Math.floor(n / M);
  if (N < 1) return result('Block frequency', [], null, n, alpha, false, 'block larger than sequence');
  let chi = 0;
  for (let b = 0; b < N; b++) { let s = 0; for (let j = 0; j < M; j++) s += x[b * M + j]; chi += (s / M - 0.5) ** 2; }
  chi *= 4 * M;
  return result('Block frequency', [igamc(N / 2, chi / 2)], chi, n, alpha, true, `M=${M}`);
}
export function runs(x, alpha = 0.01, strict = true) {
  const n = x.length;
  if (strict && n < 100) return result('Runs', [], null, n, alpha, false, 'requires n >= 100');
  const pi = sum(x) / n;
  if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) return result('Runs', [0], null, n, alpha, true, 'frequency pre-test failed');
  let v = 1; for (let i = 1; i < n; i++) if (x[i] !== x[i - 1]) v++;
  const p = erfc(Math.abs(v - 2 * n * pi * (1 - pi)) / (2 * Math.sqrt(2 * n) * pi * (1 - pi)));
  return result('Runs', [p], v, n, alpha);
}
const LR = [
  [750000, 10000, [10, 11, 12, 13, 14, 15, 16], [0.0882, 0.2092, 0.2483, 0.1933, 0.1208, 0.0675, 0.0727]],
  [6272, 128, [4, 5, 6, 7, 8, 9], [0.1174, 0.2430, 0.2493, 0.1752, 0.1027, 0.1124]],
  [128, 8, [1, 2, 3, 4], [0.2148, 0.3672, 0.2305, 0.1875]],
];
export function longestRun(x, alpha = 0.01) {
  const n = x.length; const row = LR.find((r) => n >= r[0]);
  if (!row) return result('Longest run of ones', [], null, n, alpha, false, 'requires n >= 128');
  const [, M, bounds, probs] = row; const N = Math.floor(n / M); const counts = new Array(bounds.length).fill(0);
  for (let b = 0; b < N; b++) {
    let longest = 0, run = 0;
    for (let j = 0; j < M; j++) { run = x[b * M + j] ? run + 1 : 0; if (run > longest) longest = run; }
    if (longest <= bounds[0]) counts[0]++; else if (longest >= bounds[bounds.length - 1]) counts[counts.length - 1]++; else counts[bounds.indexOf(longest)]++;
  }
  let chi = 0; for (let i = 0; i < counts.length; i++) chi += (counts[i] - N * probs[i]) ** 2 / (N * probs[i]);
  const K = bounds.length - 1;
  return result('Longest run of ones', [igamc(K / 2, chi / 2)], chi, n, alpha, true, `M=${M}`);
}
function cusumP(n, z) {
  if (z === 0) return 1;
  let s1 = 0, s2 = 0; const r = Math.sqrt(n);
  for (let k = Math.trunc((-n / z + 1) / 4); k <= Math.trunc((n / z - 1) / 4); k++) s1 += normalCdf(((4 * k + 1) * z) / r) - normalCdf(((4 * k - 1) * z) / r);
  for (let k = Math.trunc((-n / z - 3) / 4); k <= Math.trunc((n / z - 1) / 4); k++) s2 += normalCdf(((4 * k + 3) * z) / r) - normalCdf(((4 * k + 1) * z) / r);
  return 1 - s1 + s2;
}
export function cumulativeSums(x, alpha = 0.01, strict = true) {
  const n = x.length;
  if (strict && n < 100) return result('Cumulative sums', [], null, n, alpha, false, 'requires n >= 100');
  let s = 0, zf = 0; for (let i = 0; i < n; i++) { s += 2 * x[i] - 1; zf = Math.max(zf, Math.abs(s)); }
  s = 0; let zb = 0; for (let i = n - 1; i >= 0; i--) { s += 2 * x[i] - 1; zb = Math.max(zb, Math.abs(s)); }
  return result('Cumulative sums', [cusumP(n, zf), cusumP(n, zb)], Math.max(zf, zb), n, alpha);
}
function patternCounts(x, m) {
  const n = x.length; if (m === 0) return [n];
  const c = new Float64Array(1 << m);
  for (let i = 0; i < n; i++) { let idx = 0; for (let j = 0; j < m; j++) idx = (idx << 1) | x[(i + j) % n]; c[idx]++; }
  return c;
}
export function approximateEntropy(x, alpha = 0.01, m = null, strict = true) {
  const n = x.length;
  if (m === null) m = n > 1 ? Math.min(10, Math.floor(Math.log2(n)) - 6) : 0;
  if ((strict && n < 100) || m < 1) return result('Approximate entropy', [], null, n, alpha, false, 'sequence too short');
  const phi = (mm) => { let s = 0; for (const c of patternCounts(x, mm)) if (c > 0) { const p = c / n; s += p * Math.log(p); } return s; };
  const apen = phi(m) - phi(m + 1); const chi = 2 * n * (Math.LN2 - apen);
  return result('Approximate entropy', [igamc(2 ** (m - 1), chi / 2)], chi, n, alpha, true, `m=${m}`);
}
export function serial(x, alpha = 0.01, m = null, strict = true) {
  const n = x.length;
  if (m === null) m = n > 1 ? Math.min(16, Math.floor(Math.log2(n)) - 3) : 0;
  if ((strict && n < 100) || m < 3) return result('Serial', [], null, n, alpha, false, 'sequence too short');
  const psi2 = (mm) => { if (mm <= 0) return 0; let s = 0; for (const c of patternCounts(x, mm)) s += c * c; return ((2 ** mm) / n) * s - n; };
  const p0 = psi2(m), p1 = psi2(m - 1), p2 = psi2(m - 2);
  const d1 = p0 - p1, d2 = p0 - 2 * p1 + p2;
  return result('Serial', [igamc(2 ** (m - 2), d1 / 2), igamc(2 ** (m - 3), d2 / 2)], d1, n, alpha, true, `m=${m}`);
}

// ---- exact DFT magnitude of arbitrary length (radix-2 FFT + Bluestein) ----
function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
export function dftMagnitude(x) {
  const n = x.length;
  if ((n & (n - 1)) === 0) { const re = Float64Array.from(x), im = new Float64Array(n); fft(re, im); return re.map((r, i) => Math.hypot(r, im[i])); }
  let m = 1; while (m < 2 * n - 1) m <<= 1;
  const wr = new Float64Array(n), wi = new Float64Array(n);
  for (let k = 0; k < n; k++) { const a = (Math.PI * ((k * k) % (2 * n))) / n; wr[k] = Math.cos(a); wi[k] = -Math.sin(a); }
  const ar = new Float64Array(m), ai = new Float64Array(m), br = new Float64Array(m), bi = new Float64Array(m);
  for (let k = 0; k < n; k++) { ar[k] = x[k] * wr[k]; ai[k] = x[k] * wi[k]; }
  br[0] = wr[0]; bi[0] = -wi[0];
  for (let k = 1; k < n; k++) { br[k] = br[m - k] = wr[k]; bi[k] = bi[m - k] = -wi[k]; }
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < m; i++) { const r = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; }
  fft(ar, ai, true);
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) { const r = ar[k] * wr[k] - ai[k] * wi[k], i = ar[k] * wi[k] + ai[k] * wr[k]; out[k] = Math.hypot(r, i); }
  return out;
}
export function spectral(x, alpha = 0.01, strict = true) {
  const n = x.length;
  if (strict && n < 1000) return result('Spectral (DFT)', [], null, n, alpha, false, 'requires n >= 1000');
  const mod = dftMagnitude(Array.from(x, (b) => 2 * b - 1));
  const T = Math.sqrt(Math.log(1 / 0.05) * n), N0 = (0.95 * n) / 2;
  let N1 = 0; for (let i = 0; i < Math.floor(n / 2); i++) if (mod[i] < T) N1++;
  const d = (N1 - N0) / Math.sqrt((n * 0.95 * 0.05) / 4);
  return result('Spectral (DFT)', [erfc(Math.abs(d) / Math.SQRT2)], d, n, alpha);
}
export function runAll(x, alpha = 0.01) {
  return [monobit(x, alpha), blockFrequency(x, alpha), runs(x, alpha), longestRun(x, alpha), cumulativeSums(x, alpha),
    approximateEntropy(x, alpha), serial(x, alpha), spectral(x, alpha)];
}
