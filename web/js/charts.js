// Lightweight, dependency-free SVG charts with hover tooltips and SVG/PNG/CSV export.
// Colours are resolved from CSS custom properties at render time so exported files
// keep the on-screen palette (light or dark).

const NS = 'http://www.w3.org/2000/svg';
const registry = new Set();
let tip;

export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
export const SERIES = () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar(`--series-${i}`));

function tooltip() {
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
  return tip;
}
function showTip(html, ev) {
  const t = tooltip(); t.innerHTML = html; t.style.opacity = '1';
  const pad = 14, w = t.offsetWidth, hgt = t.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
  if (y + hgt > window.innerHeight - 8) y = ev.clientY - hgt - pad;
  t.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}
function hideTip() { if (tip) tip.style.opacity = '0'; }

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, x, y, str, attrs = {}) { const t = el('text', { x, y, ...attrs }, parent); t.textContent = str; return t; }

export function fmtNum(v, digits = 3) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2).replace('e', 'e');
  return Number(v.toFixed(digits)).toString();
}

function niceStep(span, count) {
  const raw = span / Math.max(count, 1), mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
}
function linearTicks(lo, hi, count = 5) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo, count), out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
function logTicks(lo, hi) {
  const out = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) { const v = 10 ** e; if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
  if (out.length > 8) return out.filter((_, i) => i % Math.ceil(out.length / 6) === 0);
  return out;
}
function makeScale(axis, lo, hi, a, b) {
  if (axis.type === 'log') {
    const l0 = Math.log10(lo), l1 = Math.log10(hi);
    const f = (v) => a + ((Math.log10(Math.max(v, lo)) - l0) / (l1 - l0 || 1)) * (b - a);
    f.ticks = () => logTicks(lo, hi); f.invert = (p) => 10 ** (l0 + ((p - a) / (b - a)) * (l1 - l0)); return f;
  }
  const f = (v) => a + ((v - lo) / (hi - lo || 1)) * (b - a);
  f.ticks = (n) => linearTicks(lo, hi, n); f.invert = (p) => lo + ((p - a) / (b - a)) * (hi - lo); return f;
}
function extent(layers, key, axis) {
  if (axis.domain) return axis.domain.slice();
  let lo = Infinity, hi = -Infinity;
  for (const L of layers) {
    let vals;
    if (L.type === 'hline') vals = key === 'y' ? [L.y] : [];
    else if (L.type === 'vline') vals = key === 'x' ? [L.x] : [];
    else if (['box', 'violin', 'strip'].includes(L.type)) vals = key === 'x' ? L.x.flatMap((x) => [x - (L.boxWidth || 0.6) / 2 - 0.25, x + (L.boxWidth || 0.6) / 2 + 0.25]) : L.data.flat();
    else if (L.type === 'errorbar') vals = key === 'x' ? Array.from(L.x) : [...L.y, ...L.lo, ...L.hi];
    else vals = key === 'x' ? Array.from(L.x || []) : [...(L.y || []), ...(L.y0 || []), ...(L.y1 || [])];
    for (const v of vals) { if (v === null || !Number.isFinite(v) || (axis.type === 'log' && v <= 0)) continue; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (key === 'y' && L.type === 'bar' && axis.type !== 'log') { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  }
  if (!Number.isFinite(lo)) { lo = axis.type === 'log' ? 1e-6 : 0; hi = 1; }
  if (axis.type === 'log') { if (lo === hi) { lo /= 10; hi *= 10; } return [Math.max(lo, axis.min || 1e-300), hi]; }
  if (key === 'x' && layers.some((L) => L.type === 'bar')) { const w = layers.find((L) => L.type === 'bar').width || barWidth(layers.find((L) => L.type === 'bar').x); lo -= w / 2; hi += w / 2; }
  if (lo === hi) { lo -= 1; hi += 1; }
  if (key === 'y' && !axis.tight) { const pad = (hi - lo) * 0.06; if (lo !== 0) lo -= pad; hi += pad; }
  return [lo, hi];
}
function q7(sorted, p) { const n = sorted.length; if (!n) return NaN; const h = (n - 1) * p, lo = Math.floor(h), hi = Math.min(lo + 1, n - 1); return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]); }
export function boxStats(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q1 = q7(v, 0.25), med = q7(v, 0.5), q3 = q7(v, 0.75), iqr = q3 - q1;
  const lo = v.find((x) => x >= q1 - 1.5 * iqr), hi = [...v].reverse().find((x) => x <= q3 + 1.5 * iqr);
  return { q1, med, q3, lo, hi, min: v[0], max: v[v.length - 1], n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, outliers: v.filter((x) => x < lo || x > hi), sorted: v };
}
function kde(sorted, grid) {
  const n = sorted.length, m = sorted.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(sorted.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(n - 1, 1));
  const iqr = q7(sorted, 0.75) - q7(sorted, 0.25);
  const h = 0.9 * Math.max(Math.min(sd, iqr / 1.34) || sd || 1e-3, 1e-6) * n ** -0.2;
  return grid.map((g) => { let s = 0; for (const x of sorted) s += Math.exp(-0.5 * ((g - x) / h) ** 2); return s / (n * h * Math.sqrt(2 * Math.PI)); });
}
const hash01 = (i) => { let x = Math.imul(i + 0x9e3779b9, 0x85ebca6b) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

function barWidth(x) { if (!x || x.length < 2) return 1; let m = Infinity; for (let i = 1; i < x.length; i++) m = Math.min(m, Math.abs(x[i] - x[i - 1])); return m; }

/** Render an XY plot. spec: {height, x:{label,type,domain,format}, y:{...}, layers:[...], legend, ariaLabel} */
export function plot(container, spec) {
  register(container, () => plot(container, spec), spec);
  container.innerHTML = '';
  const W = Math.max(container.clientWidth || 600, 260), H = spec.height || 260;
  const series = SERIES();
  const ink = cssVar('--ink-2'), muted = cssVar('--ink-3'), grid = cssVar('--grid'), axisC = cssVar('--axis'), surface = cssVar('--clay');
  const layers = spec.layers.map((L, i) => ({ ...L, color: L.color || series[(L.slot ?? i) % 8] }));
  const named = layers.filter((L) => L.name && L.type !== 'hline' && L.type !== 'vline');
  // legend layout (wraps onto several rows on narrow charts)
  const legendItems = []; let lxx = 56, lrow = 0;
  if (spec.legend !== false && named.length > 1) for (const L of named) {
    const w = 30 + L.name.length * 6.2;
    if (lxx + w > W - 8 && lxx > 56) { lxx = 56; lrow++; }
    legendItems.push([L, lxx, lrow]); lxx += w;
  }
  const legendH = legendItems.length ? 22 * (lrow + 1) + 4 : 0;
  const m = { l: spec.marginLeft || 56, r: 16, t: 12 + legendH, b: spec.x.label ? 46 : 30 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': spec.ariaLabel || spec.title || 'chart', 'font-family': cssVar('--font'), 'font-size': 11 });
  el('rect', { x: 0, y: 0, width: W, height: H, fill: surface }, svg);
  const [x0, x1] = extent(layers, 'x', spec.x), [y0, y1] = extent(layers, 'y', spec.y);
  const X = makeScale(spec.x, x0, x1, m.l, W - m.r), Y = makeScale(spec.y, y0, y1, H - m.b, m.t);
  const logFmt = (v) => (v >= 0.01 ? fmtNum(v, 2) : `1e${Math.round(Math.log10(v))}`);
  const fx = spec.x.format || (spec.x.type === 'log' ? logFmt : fmtNum), fy = spec.y.format || (spec.y.type === 'log' ? logFmt : fmtNum);

  // grid + axes
  const g = el('g', {}, svg);
  for (const t of (spec.y.ticks || Y.ticks(5)).filter((v) => !spec.y.integer || Number.isInteger(v))) { const py = Y(t); el('line', { x1: m.l, x2: W - m.r, y1: py, y2: py, stroke: grid, 'stroke-width': 1 }, g); text(g, m.l - 8, py + 4, fy(t), { 'text-anchor': 'end', fill: muted, 'font-variant-numeric': 'tabular-nums' }); }
  const xt = (spec.x.ticks || X.ticks(Math.max(2, Math.floor((W - m.l) / 80)))).filter((v) => !spec.x.integer || Number.isInteger(v));
  for (const t of xt) { const px = X(t); el('line', { x1: px, x2: px, y1: H - m.b, y2: H - m.b + 4, stroke: axisC }, g); text(g, px, H - m.b + 17, fx(t), { 'text-anchor': 'middle', fill: muted, 'font-variant-numeric': 'tabular-nums' }); }
  el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: axisC, 'stroke-width': 1 }, g);
  if (spec.x.label) text(g, m.l + (W - m.l - m.r) / 2, H - 8, spec.x.label, { 'text-anchor': 'middle', fill: ink, 'font-size': 12 });
  if (spec.y.label) text(g, 14, m.t + (H - m.t - m.b) / 2, spec.y.label, { 'text-anchor': 'middle', fill: ink, 'font-size': 12, transform: `rotate(-90 14 ${m.t + (H - m.t - m.b) / 2})` });

  const clipId = 'c' + Math.random().toString(36).slice(2);
  const defs = el('defs', {}, svg); const cp = el('clipPath', { id: clipId }, defs);
  el('rect', { x: m.l, y: m.t - 2, width: W - m.l - m.r, height: H - m.t - m.b + 4 }, cp);
  const plotG = el('g', { 'clip-path': `url(#${clipId})` }, svg);
  const yBase = Y(spec.y.type === 'log' ? y0 : Math.max(y0, Math.min(0, y1)));

  for (const L of layers) {
    if (L.type === 'band') {
      let d = ''; L.x.forEach((xv, i) => { d += `${i ? 'L' : 'M'}${X(xv)},${Y(L.y1[i])}`; });
      for (let i = L.x.length - 1; i >= 0; i--) d += `L${X(L.x[i])},${Y(L.y0[i])}`;
      el('path', { d: d + 'Z', fill: L.color, 'fill-opacity': L.opacity ?? 0.15, stroke: 'none' }, plotG);
    } else if (L.type === 'bar') {
      const bw = Math.abs(X((L.width || barWidth(L.x)) + x0) - X(x0)) * (L.barFrac || 1);
      const gap = bw > 6 ? 2 : bw > 2.5 ? 0.6 : 0;
      const w = Math.max(bw - gap, 0.6), r = Math.min(4, w / 2);
      let d = '';
      L.x.forEach((xv, i) => {
        const v = L.y[i]; if (v === null || !Number.isFinite(v)) return;
        const px = X(xv) - w / 2 + (L.offset || 0) * w, top = Y(v), base = spec.y.type === 'log' ? Y(y0) : yBase;
        const hgt = base - top;
        if (Math.abs(hgt) < 0.01) return;
        if (hgt > 0 && r > 0.5 && hgt > r) d += `M${px},${base}V${top + r}Q${px},${top} ${px + r},${top}H${px + w - r}Q${px + w},${top} ${px + w},${top + r}V${base}Z`;
        else d += `M${px},${Math.min(base, top)}h${w}v${Math.abs(hgt)}h${-w}Z`;
      });
      el('path', { d, fill: L.color, 'fill-opacity': L.opacity ?? 1 }, plotG);
    } else if (L.type === 'line' || L.type === 'area') {
      let d = '', started = false;
      L.x.forEach((xv, i) => { const v = L.y[i]; if (v === null || !Number.isFinite(v) || (spec.y.type === 'log' && v <= 0)) { started = false; return; } d += `${started ? 'L' : 'M'}${X(xv).toFixed(2)},${Y(v).toFixed(2)}`; started = true; });
      if (L.type === 'area' && d) el('path', { d: `${d}L${X(L.x[L.x.length - 1])},${yBase}L${X(L.x[0])},${yBase}Z`, fill: L.color, 'fill-opacity': 0.14 }, plotG);
      el('path', { d, fill: 'none', stroke: L.color, 'stroke-width': L.strokeWidth || 2, 'stroke-dasharray': L.dash || null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, plotG);
      if (L.markers) L.x.forEach((xv, i) => { const v = L.y[i]; if (v === null || !Number.isFinite(v)) return; el('circle', { cx: X(xv), cy: Y(v), r: 4, fill: L.color, stroke: surface, 'stroke-width': 2 }, plotG); });
    } else if (L.type === 'scatter') {
      L.x.forEach((xv, i) => { const v = L.y[i]; if (v === null || !Number.isFinite(v)) return; el('circle', { cx: X(xv), cy: Y(v), r: L.r || 4.5, fill: (L.colors && L.colors[i]) || L.color, 'fill-opacity': 0.9, stroke: surface, 'stroke-width': 2 }, plotG); });
    } else if (L.type === 'box' || L.type === 'violin' || L.type === 'strip') {
      const half = (L.boxWidth || 0.6) / 2;
      L._stats = L.data.map((d) => boxStats(d));
      L.x.forEach((xc, i) => {
        const st = L._stats[i]; if (!st) return;
        const xl = X(xc - half), xr = X(xc + half), cx = X(xc), w = xr - xl;
        if (L.type === 'violin' && st.n > 1) {
          const grid = Array.from({ length: 48 }, (_, k) => st.min + ((st.max - st.min) * k) / 47);
          const dens = kde(st.sorted, grid), mx = Math.max(...dens) || 1;
          let d = ''; grid.forEach((g, k) => { d += `${k ? 'L' : 'M'}${cx + (dens[k] / mx) * (w / 2)},${Y(g)}`; });
          for (let k = grid.length - 1; k >= 0; k--) d += `L${cx - (dens[k] / mx) * (w / 2)},${Y(grid[k])}`;
          el('path', { d: d + 'Z', fill: L.color, 'fill-opacity': 0.28, stroke: L.color, 'stroke-width': 1.5 }, plotG);
          el('line', { x1: cx, x2: cx, y1: Y(st.lo), y2: Y(st.hi), stroke: L.color, 'stroke-width': 1.5 }, plotG);
          el('rect', { x: cx - 3.5, y: Y(st.q3), width: 7, height: Math.max(Y(st.q1) - Y(st.q3), 1), rx: 3, fill: L.color }, plotG);
          el('circle', { cx, cy: Y(st.med), r: 3.5, fill: surface, stroke: L.color, 'stroke-width': 2 }, plotG);
        } else if (L.type === 'box') {
          el('line', { x1: cx, x2: cx, y1: Y(st.lo), y2: Y(st.q1), stroke: L.color, 'stroke-width': 1.5 }, plotG);
          el('line', { x1: cx, x2: cx, y1: Y(st.q3), y2: Y(st.hi), stroke: L.color, 'stroke-width': 1.5 }, plotG);
          for (const v of [st.lo, st.hi]) el('line', { x1: cx - w / 4, x2: cx + w / 4, y1: Y(v), y2: Y(v), stroke: L.color, 'stroke-width': 1.5 }, plotG);
          el('rect', { x: xl, y: Y(st.q3), width: w, height: Math.max(Y(st.q1) - Y(st.q3), 1), rx: 4, fill: L.color, 'fill-opacity': 0.25, stroke: L.color, 'stroke-width': 1.5 }, plotG);
          el('line', { x1: xl, x2: xr, y1: Y(st.med), y2: Y(st.med), stroke: L.color, 'stroke-width': 2.5 }, plotG);
          for (const o of st.outliers) el('circle', { cx: cx + (hash01(Math.round(o * 1e6)) - 0.5) * w * 0.3, cy: Y(o), r: 3, fill: 'none', stroke: L.color, 'stroke-width': 1.5 }, plotG);
        }
        if (L.type === 'strip' || L.points) L.data[i].forEach((v, k) => { if (Number.isFinite(v)) el('circle', { cx: cx + (hash01(k * 7919 + i) - 0.5) * w * 0.8, cy: Y(v), r: 2.6, fill: L.color, 'fill-opacity': 0.55 }, plotG); });
      });
      L.y = L._stats.map((st) => (st ? st.med : null));
    } else if (L.type === 'errorbar') {
      L.x.forEach((xv, i) => {
        if (!Number.isFinite(L.y[i])) return; const px = X(xv);
        el('line', { x1: px, x2: px, y1: Y(L.lo[i]), y2: Y(L.hi[i]), stroke: L.color, 'stroke-width': 1.5 }, plotG);
        for (const v of [L.lo[i], L.hi[i]]) el('line', { x1: px - 4, x2: px + 4, y1: Y(v), y2: Y(v), stroke: L.color, 'stroke-width': 1.5 }, plotG);
        el('circle', { cx: px, cy: Y(L.y[i]), r: 4, fill: L.color, stroke: surface, 'stroke-width': 2 }, plotG);
      });
    } else if (L.type === 'hline') {
      const py = Y(L.y); el('line', { x1: m.l, x2: W - m.r, y1: py, y2: py, stroke: L.color || muted, 'stroke-width': 1.5, 'stroke-dasharray': L.dash || '5 4' }, svg);
      if (L.label) text(svg, W - m.r - 4, py - 5, L.label, { 'text-anchor': 'end', fill: ink, 'font-size': 11 });
    } else if (L.type === 'vline') {
      const px = X(L.x); el('line', { x1: px, x2: px, y1: m.t, y2: H - m.b, stroke: L.color || muted, 'stroke-width': 1.5, 'stroke-dasharray': L.dash || '5 4' }, svg);
      if (L.label) text(svg, px + 5, m.t + 12, L.label, { fill: ink, 'font-size': 11 });
    }
  }
  // legend
  if (legendH) {
    const lg = el('g', {}, svg);
    for (const [L, lx, row] of legendItems) {
      const oy = row * 22;
      text(lg, lx + 16, 16 + oy, L.name, { fill: ink, 'font-size': 11.5 });
      if (L.type === 'line' && L.dash) el('line', { x1: lx, x2: lx + 11, y1: 12 + oy, y2: 12 + oy, stroke: L.color, 'stroke-width': 2.5, 'stroke-dasharray': '3 2' }, lg);
      else el('rect', { x: lx, y: 7 + oy, width: 11, height: 11, rx: 3, fill: L.color }, lg);
    }
  }
  // hover layer
  const hoverable = layers.filter((L) => ['bar', 'line', 'area', 'scatter', 'box', 'violin', 'strip', 'errorbar'].includes(L.type) && L.x && L.x.length);
  if (hoverable.length && spec.hover !== false) {
    const cross = el('line', { y1: m.t, y2: H - m.b, stroke: muted, 'stroke-width': 1, opacity: 0 }, svg);
    const dots = hoverable.map((L) => el('circle', { r: 5, fill: L.color, stroke: surface, 'stroke-width': 2, opacity: 0 }, svg));
    const hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', (ev) => {
      const rect = svg.getBoundingClientRect(), px = ((ev.clientX - rect.left) / rect.width) * W, xv = X.invert(px);
      let rows = '', xs = null;
      hoverable.forEach((L, k) => {
        let best = 0, bd = Infinity; for (let i = 0; i < L.x.length; i++) { const dd = Math.abs(L.x[i] - xv); if (dd < bd) { bd = dd; best = i; } }
        const v = L.y[best];
        if (xs === null) xs = L.x[best];
        if (v === null || !Number.isFinite(v)) { dots[k].setAttribute('opacity', 0); return; }
        dots[k].setAttribute('cx', X(L.x[best])); dots[k].setAttribute('cy', Y(v));
        dots[k].setAttribute('opacity', ['bar', 'box', 'violin', 'strip', 'errorbar'].includes(L.type) ? 0 : 1);
        const st = L._stats && L._stats[best];
        rows += st ? `<div class="tip-row"><span class="tip-key" style="background:${L.color}"></span>${L.name || 'median'}<b>${fmtNum(st.med, 4)}</b></div><div class="tip-row small">Q1–Q3<b>${fmtNum(st.q1, 3)} – ${fmtNum(st.q3, 3)}</b></div><div class="tip-row small">n · mean<b>${st.n} · ${fmtNum(st.mean, 4)}</b></div>`
          : `<div class="tip-row"><span class="tip-key" style="background:${L.color}"></span>${L.name || spec.y.label || 'value'}<b>${spec.y.format ? fy(v) : fmtNum(v, 4)}</b>${L.lo ? `</div><div class="tip-row small">interval<b>${fmtNum(L.lo[best], 3)} – ${fmtNum(L.hi[best], 3)}</b>` : ''}</div>`;
      });
      cross.setAttribute('x1', X(xs)); cross.setAttribute('x2', X(xs)); cross.setAttribute('opacity', 0.6);
      showTip(`<div class="tip-head">${spec.x.label || 'x'}: ${spec.x.tipFormat ? spec.x.tipFormat(xs) : spec.x.format ? fx(xs) : fmtNum(xs, 4)}</div>${rows}`, ev);
    });
    hit.addEventListener('pointerleave', () => { hideTip(); cross.setAttribute('opacity', 0); dots.forEach((d) => d.setAttribute('opacity', 0)); });
  }
  container.appendChild(svg);
  container._csv = () => layersToCsv(spec);
  container._table = () => layersToTable(spec);
  return svg;
}

function layersToCsv(spec) {
  const boxes = spec.layers.filter((l) => l.data);
  if (boxes.length) {
    const head = ['series', 'x', 'n', 'min', 'q1', 'median', 'q3', 'max', 'mean'], rows = [head.join(',')];
    for (const l of boxes) l.x.forEach((x, i) => { const st = boxStats(l.data[i]); if (st) rows.push([(l.name || 'series').replace(/,/g, ' '), spec.x.tipFormat ? spec.x.tipFormat(x) : x, st.n, st.min, st.q1, st.med, st.q3, st.max, st.mean].join(',')); });
    return rows.join('\n');
  }
  const L = spec.layers.filter((l) => l.x && l.y && l.type !== 'band');
  const xs = [...new Set(L.flatMap((l) => l.x))].sort((a, b) => a - b);
  const head = [spec.x.label || 'x', ...L.map((l, i) => (l.name || `series${i + 1}`).replace(/,/g, ' '))];
  const rows = xs.map((x) => [x, ...L.map((l) => { const i = l.x.indexOf(x); return i >= 0 && l.y[i] !== null ? l.y[i] : ''; })]);
  return [head, ...rows].map((r) => r.join(',')).join('\n');
}
function layersToTable(spec) {
  const csv = layersToCsv(spec).split('\n').map((r) => r.split(','));
  if (spec.layers.some((l) => l.data)) { const h = csv.shift(); return `<table class="data-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${csv.map((r) => `<tr>${r.map((c, i) => `<td>${i < 2 ? c : fmtNum(+c, 4)}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }
  const head = csv.shift();
  return `<table class="data-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${csv.slice(0, 2000).map((r) => `<tr>${r.map((c) => `<td>${c === '' ? '' : fmtNum(+c, 5)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ---------------------------------------------------------------- heatmap
function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
}
export function colorScale(kind) {
  if (kind === 'binary') { const c0 = cssVar('--bit0'), c1 = cssVar('--bit1'); return (v) => mix(v > 0.5 ? c1 : c0, v > 0.5 ? c1 : c0, 0); }
  if (kind === 'diverging') {
    const lo = cssVar('--div-lo'), mid = cssVar('--div-mid'), hi = cssVar('--div-hi');
    return (v) => (v < 0.5 ? mix(lo, mid, v * 2) : mix(mid, hi, (v - 0.5) * 2));
  }
  const a = cssVar('--seq-lo'), b = cssVar('--seq-hi');
  return (v) => mix(a, b, v);
}
/** spec: {rows, cols, value(r,c), domain:[lo,hi], scale, xLabel, yLabel, tip(r,c,v), height, legendLabel} */
export function heatmap(container, spec) {
  register(container, () => heatmap(container, spec), spec);
  container.innerHTML = '';
  const W = Math.max(container.clientWidth || 600, 260);
  const legendH = spec.scale === 'binary' ? 0 : 34;
  const m = { l: 52, r: 12, t: 10, b: 40 + legendH };
  const innerW = W - m.l - m.r;
  const cell = spec.square ? Math.min(innerW / spec.cols, 14) : innerW / spec.cols;
  const H = spec.height || Math.min(Math.max(spec.rows * (spec.square ? cell : Math.max(cell, 3)), 120), 520) + m.t + m.b;
  const ph = H - m.t - m.b, pw = spec.square ? cell * spec.cols : innerW;
  const cv = document.createElement('canvas'); cv.width = spec.cols; cv.height = spec.rows;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(spec.cols, spec.rows), sc = colorScale(spec.scale);
  const [lo, hi] = spec.domain, nan = mix(cssVar('--grid').replace('#', '').padEnd(6, '0'), cssVar('--grid').replace('#', '').padEnd(6, '0'), 0);
  for (let r = 0; r < spec.rows; r++) for (let c = 0; c < spec.cols; c++) {
    const v = spec.value(r, c); const k = (r * spec.cols + c) * 4;
    const rgb = v === null || Number.isNaN(v) ? nan : sc(Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))));
    img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const ink = cssVar('--ink-2'), muted = cssVar('--ink-3');
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': spec.ariaLabel || 'heatmap', 'font-family': cssVar('--font'), 'font-size': 11 });
  el('rect', { x: 0, y: 0, width: W, height: H, fill: cssVar('--clay') }, svg);
  el('image', { href: cv.toDataURL(), x: m.l, y: m.t, width: pw, height: ph, preserveAspectRatio: 'none', style: 'image-rendering:pixelated' }, svg);
  el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'none', stroke: cssVar('--axis') }, svg);
  const yt = linearTicks(0, spec.rows - 1, Math.min(6, spec.rows)).filter((t) => Number.isInteger(t));
  for (const t of yt) text(svg, m.l - 6, m.t + ((t + 0.5) / spec.rows) * ph + 4, spec.yTick ? spec.yTick(t) : t, { 'text-anchor': 'end', fill: muted });
  const xt = linearTicks(0, spec.cols - 1, Math.max(2, Math.floor(pw / 70))).filter((t) => Number.isInteger(t));
  for (const t of xt) text(svg, m.l + ((t + 0.5) / spec.cols) * pw, m.t + ph + 15, t, { 'text-anchor': 'middle', fill: muted });
  if (spec.xLabel) text(svg, m.l + pw / 2, m.t + ph + 32, spec.xLabel, { 'text-anchor': 'middle', fill: ink, 'font-size': 12 });
  if (spec.yLabel) text(svg, 12, m.t + ph / 2, spec.yLabel, { 'text-anchor': 'middle', fill: ink, 'font-size': 12, transform: `rotate(-90 12 ${m.t + ph / 2})` });
  if (legendH) {
    const lw = Math.min(220, pw), lx = m.l, ly = H - 22, grad = el('linearGradient', { id: 'lg' + Math.random().toString(36).slice(2) }, el('defs', {}, svg));
    for (let i = 0; i <= 10; i++) el('stop', { offset: `${i * 10}%`, 'stop-color': `rgb(${sc(i / 10).join(',')})` }, grad);
    el('rect', { x: lx, y: ly - 10, width: lw, height: 10, rx: 3, fill: `url(#${grad.id})` }, svg);
    text(svg, lx, ly + 12, fmtNum(lo, 2), { fill: muted }); text(svg, lx + lw, ly + 12, fmtNum(hi, 2), { fill: muted, 'text-anchor': 'end' });
    if (spec.legendLabel) text(svg, lx + lw + 10, ly - 1, spec.legendLabel, { fill: ink });
  }
  const hit = el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' }, svg);
  hit.addEventListener('pointermove', (ev) => {
    const rect = svg.getBoundingClientRect(), sx = W / rect.width;
    const c = Math.floor((((ev.clientX - rect.left) * sx - m.l) / pw) * spec.cols), r = Math.floor((((ev.clientY - rect.top) * sx - m.t) / ph) * spec.rows);
    if (r < 0 || c < 0 || r >= spec.rows || c >= spec.cols) return hideTip();
    showTip(spec.tip ? spec.tip(r, c, spec.value(r, c)) : `row ${r}, col ${c}: <b>${fmtNum(spec.value(r, c), 4)}</b>`, ev);
  });
  hit.addEventListener('pointerleave', hideTip);
  container.appendChild(svg);
  container._csv = () => { const rows = []; for (let r = 0; r < spec.rows; r++) { const row = []; for (let c = 0; c < spec.cols; c++) row.push(spec.value(r, c) ?? ''); rows.push(row.join(',')); } return rows.join('\n'); };
  container._table = null;
  return svg;
}

// ------------------------------------------------------------------ radar
/** spec: {axes:[label], series:[{name, values:[0..1], slot}], height} */
export function radar(container, spec) {
  register(container, () => radar(container, spec), spec);
  container.innerHTML = '';
  const W = Math.max(container.clientWidth || 360, 240), H = spec.height || Math.min(W, 340);
  const narrow = W < 460, cx = W / 2, cy = H / 2 + (spec.series.length > 1 ? 10 : 0), R = Math.min(W, H) / 2 - (narrow ? 78 : 52), n = spec.axes.length, series = SERIES();
  const ink = cssVar('--ink-2'), grid = cssVar('--grid'), surface = cssVar('--clay');
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': spec.ariaLabel || 'radar chart', 'font-family': cssVar('--font'), 'font-size': 11 });
  el('rect', { x: 0, y: 0, width: W, height: H, fill: surface }, svg);
  const pt = (i, v) => [cx + Math.sin((2 * Math.PI * i) / n) * R * v, cy - Math.cos((2 * Math.PI * i) / n) * R * v];
  for (const lv of [0.25, 0.5, 0.75, 1]) el('polygon', { points: spec.axes.map((_, i) => pt(i, lv).join(',')).join(' '), fill: 'none', stroke: grid }, svg);
  spec.axes.forEach((a, i) => {
    const [x, y] = pt(i, 1); el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: grid }, svg);
    const [lx, ly] = pt(i, 1.17); text(svg, lx, ly + 4, a, { 'text-anchor': Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end', fill: ink, 'font-size': narrow ? 10.5 : 11.5 });
  });
  spec.series.forEach((s, k) => {
    const c = series[(s.slot ?? k) % 8];
    el('polygon', { points: s.values.map((v, i) => pt(i, Math.max(0, Math.min(1, v || 0))).join(',')).join(' '), fill: c, 'fill-opacity': 0.16, stroke: c, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    s.values.forEach((v, i) => {
      const [x, y] = pt(i, Math.max(0, Math.min(1, v || 0)));
      const d = el('circle', { cx: x, cy: y, r: 4.5, fill: c, stroke: surface, 'stroke-width': 2 }, svg);
      d.addEventListener('pointermove', (ev) => showTip(`<div class="tip-head">${spec.axes[i]}</div><div class="tip-row"><span class="tip-key" style="background:${c}"></span>${s.name}<b>${fmtNum(v * 100, 1)} / 100</b></div>`, ev));
      d.addEventListener('pointerleave', hideTip);
    });
  });
  if (spec.series.length > 1) {
    let lx = 12; spec.series.forEach((s, k) => { el('rect', { x: lx, y: 8, width: 11, height: 11, rx: 3, fill: series[(s.slot ?? k) % 8] }, svg); text(svg, lx + 16, 17, s.name, { fill: ink }); lx += 30 + s.name.length * 6.6; });
  }
  container.appendChild(svg);
  container._csv = () => ['series,' + spec.axes.join(','), ...spec.series.map((s) => `${s.name},${s.values.join(',')}`)].join('\n');
  container._table = null;
  return svg;
}

// ------------------------------------------------------------------ polar
/** Radial bar chart. spec: {values[], ref, max, label, slot, height, tip(i,v)} — e.g. bit-aliasing around the response. */
export function polar(container, spec) {
  register(container, () => polar(container, spec), spec);
  container.innerHTML = '';
  const W = Math.max(container.clientWidth || 360, 240), H = spec.height || Math.min(W, 380), cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 30, r0 = R * 0.3, n = spec.values.length, max = spec.max || Math.max(...spec.values);
  const ink = cssVar('--ink-2'), muted = cssVar('--ink-3'), grid = cssVar('--grid'), surface = cssVar('--clay'), c = SERIES()[(spec.slot ?? 0) % 8];
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': spec.ariaLabel || 'polar chart', 'font-family': cssVar('--font'), 'font-size': 11 });
  el('rect', { x: 0, y: 0, width: W, height: H, fill: surface }, svg);
  const rad = (v) => r0 + (Math.max(0, v) / max) * (R - r0);
  for (const f of [0.25, 0.5, 0.75, 1]) { el('circle', { cx, cy, r: rad(max * f), fill: 'none', stroke: grid }, svg); text(svg, cx + 3, cy - rad(max * f) + 11, fmtNum(max * f, 0), { fill: muted, 'font-size': 10 }); }
  const step = (2 * Math.PI) / n, gap = n > 180 ? 0 : step * 0.15;
  spec.values.forEach((v, i) => {
    const a0 = i * step - Math.PI / 2 + gap / 2, a1 = (i + 1) * step - Math.PI / 2 - gap / 2, rv = rad(v);
    const p = (a, r) => `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
    const path = el('path', { d: `M${p(a0, r0)}L${p(a0, rv)}A${rv},${rv} 0 0 1 ${p(a1, rv)}L${p(a1, r0)}A${r0},${r0} 0 0 0 ${p(a0, r0)}Z`, fill: c, 'fill-opacity': 0.85 }, svg);
    path.addEventListener('pointermove', (ev) => showTip(spec.tip ? spec.tip(i, v) : `<div class="tip-head">${i}</div><b>${fmtNum(v, 3)}</b>`, ev));
    path.addEventListener('pointerleave', hideTip);
  });
  if (spec.ref !== undefined) el('circle', { cx, cy, r: rad(spec.ref), fill: 'none', stroke: cssVar('--ink-1'), 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, svg);
  if (spec.label) text(svg, cx, cy + 4, spec.label, { 'text-anchor': 'middle', fill: ink, 'font-size': 10.5 });
  container.appendChild(svg);
  container._csv = () => ['index,value', ...spec.values.map((v, i) => `${i},${v}`)].join('\n');
  container._table = null;
  return svg;
}

// ------------------------------------------------------------------ gauge
export function gauge(value, ideal, lo, hi, status) {
  const r = 26, c = 2 * Math.PI * r, t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  const it = Math.max(0, Math.min(1, (ideal - lo) / (hi - lo)));
  const a = it * 2 * Math.PI - Math.PI / 2, ix = 32 + Math.cos(a) * r, iy = 32 + Math.sin(a) * r;
  return `<svg class="gauge" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--track)" stroke-width="7"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--status-${status})" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${(t * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 32 32)"/>
    <circle cx="${ix.toFixed(2)}" cy="${iy.toFixed(2)}" r="3.5" fill="var(--ink-1)" stroke="var(--clay)" stroke-width="1.5"><title>ideal</title></circle>
  </svg>`;
}

// ---------------------------------------------------------- registry/export
export function register(container, render, spec) {
  container._render = render; container._spec = spec; registry.add(container);
  if (!container._ro) {
    let w = container.clientWidth;
    container._ro = new ResizeObserver(() => { if (Math.abs(container.clientWidth - w) > 4 && container.isConnected) { w = container.clientWidth; container._render(); } });
    container._ro.observe(container);
  }
}
export function rerenderAll() { for (const c of registry) { if (!c.isConnected) { registry.delete(c); c._ro?.disconnect(); continue; } c._render(); } }
export { showTip, hideTip };
export function svgString(container) {
  const svg = container.querySelector('svg'); if (!svg) return null;
  const clone = svg.cloneNode(true); clone.setAttribute('xmlns', NS);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}
export function pngBlob(container, scale = 3) {
  return new Promise((resolve, reject) => {
    const svg = container.querySelector('svg'); if (!svg) return reject(new Error('no chart'));
    const w = +svg.getAttribute('width'), h = +svg.getAttribute('height');
    const img = new Image();
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale; const ctx = cv.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h); cv.toBlob(resolve, 'image/png'); };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString(container));
  });
}
