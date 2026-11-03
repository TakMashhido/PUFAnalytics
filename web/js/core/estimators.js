// Entropy estimators — mirrors pufanalytics/estimators.py.
export function shannonEntropyRate(x) {
  if (!x.length) return NaN; let s = 0; for (const b of x) s += b; const p = s / x.length;
  if (p === 0 || p === 1) return 0; return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}
export function mcvMinEntropy(x) {
  const n = x.length; if (n < 2) return NaN; let s = 0; for (const b of x) s += b;
  const p = Math.max(s, n - s) / n; const pu = Math.min(1, p + 2.576 * Math.sqrt((p * (1 - p)) / (n - 1)));
  return -Math.log2(pu);
}
export function markovMinEntropy(x, length = 128) {
  const n = x.length; if (n < 3) return NaN;
  let s = 0; for (const b of x) s += b; const p1 = s / n, p = [1 - p1, p1];
  const c = [0, 0, 0, 0]; for (let i = 0; i < n - 1; i++) c[x[i] * 2 + x[i + 1]]++;
  const t = [[0, 0], [0, 0]];
  for (const a of [0, 1]) { const tot = c[2 * a] + c[2 * a + 1]; for (const b of [0, 1]) t[a][b] = tot > 0 ? c[2 * a + b] / tot : 0; }
  const lg = (v) => (v > 0 ? Math.log2(v) : -Infinity);
  let best = [lg(p[0]), lg(p[1])];
  for (let k = 0; k < length - 1; k++) best = [0, 1].map((b) => Math.max(best[0] + lg(t[0][b]), best[1] + lg(t[1][b])));
  return Math.min(-Math.max(...best) / length, 1);
}
export function lzComplexity(s) {
  const n = s.length; if (n < 2) return NaN;
  let c = 1, l = 1, i = 0, k = 1, kmax = 1;
  for (;;) {
    if (s[i + k - 1] === s[l + k - 1]) { k++; if (l + k > n) { c++; break; } }
    else {
      if (k > kmax) kmax = k; i++;
      if (i === l) { c++; l += kmax; if (l + 1 > n) break; i = 0; k = 1; kmax = 1; } else k = 1;
    }
  }
  return (c * Math.log2(n)) / n;
}
