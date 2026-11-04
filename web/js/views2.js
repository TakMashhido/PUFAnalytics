// Figure studio (publication figures, 2D + 3D, bulk export) and Simulation studio (Monte-Carlo sweeps).
import { $, $$, esc, ICONS, toast, download, fmt, slug } from './ui.js';
import { plot, heatmap, polar, svgString, pngBlob, fmtNum } from './charts.js';
import { surface3d, bars3d, scatter3d } from './charts3d.js';
import { makeZip } from './zip.js';
import { measurement } from './core/dataset.js';
import { tmvBer, steadiness } from './core/quality.js';
import { identificationVsLength, binomPmfVector, binomialFarFrr } from './core/stats.js';
import { CODES, repetitionError, blockFailure } from './core/ecc.js';
import { METRICS, BASE_PARAMS } from './core/sweep.js';
import { chartCard, bindChartTools, needData, idx, MODEL_PARAMS, MODEL_NAMES } from './views.js';

// ---------------------------------------------------------------- helpers
function linfit(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = pts.length; if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0; for (const [a, b] of pts) { sxx += (a - mx) ** 2; sxy += (a - mx) * (b - my); syy += (b - my) ** 2; }
  if (sxx === 0) return null;
  const slope = sxy / sxx; return { slope, intercept: my - slope * mx, r: syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN, n };
}
function fitLayer(xs, ys, slot = 7) {
  const f = linfit(xs, ys); if (!f) return [];
  const lo = Math.min(...xs.filter(Number.isFinite)), hi = Math.max(...xs.filter(Number.isFinite));
  return [{ type: 'line', x: [lo, hi], y: [f.intercept + f.slope * lo, f.intercept + f.slope * hi], name: `fit (r = ${fmt(f.r, 3)})`, slot, dash: '6 4' }];
}
function ecdfFromHist(h) { const t = h.reduce((a, b) => a + b, 0); let c = 0; return h.map((v) => { c += v; return t ? c / t : NaN; }); }
function quantileFromCdf(cdf, p) { for (let k = 0; k < cdf.length; k++) if (cdf[k] >= p) return k; return cdf.length - 1; }
function perDeviceConditionBer(ds) {
  const N = ds.nBits, conds = [], data = new Map();
  ds.devices.forEach((arr, d) => {
    const acc = new Map();
    for (let m = 1; m < ds.nMeas[d]; m++) {
      const c = ds.conditions[d][m]; if (!acc.has(c)) acc.set(c, [0, 0]);
      let s = 0; for (let i = 0; i < N; i++) s += arr[m * N + i] !== arr[i] ? 1 : 0;
      const e = acc.get(c); e[0] += s / N; e[1]++;
    }
    for (const [c, [s, n]] of acc) { if (!data.has(c)) { data.set(c, []); conds.push(c); } data.get(c).push(s / n); }
  });
  return { conds, data: conds.map((c) => data.get(c)) };
}
function flipGrid(ds, maxRows = 32, maxCols = 64) {
  const N = ds.nBits, D = ds.devices.length, rb = Math.ceil(D / maxRows), cb = Math.ceil(N / maxCols);
  const rows = Math.ceil(D / rb), cols = Math.ceil(N / cb), z = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let s = 0, n = 0;
      for (let d = r * rb; d < Math.min(D, (r + 1) * rb); d++) {
        const R = ds.nMeas[d]; if (R < 2) continue; const a = ds.devices[d];
        for (let i = c * cb; i < Math.min(N, (c + 1) * cb); i++) { let f = 0; for (let m = 1; m < R; m++) f += a[m * N + i] !== a[i]; s += f / (R - 1); n++; }
      }
      row.push(n ? s / n : null);
    }
    z.push(row);
  }
  return { z, rb, cb, x: idx(cols).map((c) => c * cb), y: idx(rows).map((r) => r * rb) };
}
const FIGS = [];

// ================================================================= FIGURE STUDIO
export function figuresView(ctx, root) {
  const e = needData(ctx, root, 'the figure studio'); if (!e) return;
  const r = e.result, ds = e.ds, N = r.meta.bits, D = r.meta.devices, ui = ctx.state.ui.fig || (ctx.state.ui.fig = { code: 'BCH(127,64,10)', png: true });
  const has = { rel: !!r.reliability, id: !!r.identification, cond: r.conditions && Object.keys(r.conditions).length > 0 };
  FIGS.length = 0;
  const F = (id, title, caption, cls = '', when = true) => { if (!when) return ''; FIGS.push({ id, title, caption }); return chartCard(id, title, caption, cls); };
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <section class="card"><div class="card-head"><div><h2>Figure studio</h2><p class="card-sub">Publication-ready 2D and 3D figures for “${esc(ds.name)}”. Every figure exports as vector SVG, high-resolution PNG and the underlying CSV; 3D figures rotate by dragging and export from the current viewpoint.</p></div></div>
      <div class="row"><button class="btn primary" id="fig-zip">${ICONS.download} Download all figures (.zip)</button>
        <label class="chip" style="cursor:pointer;padding:8px 14px"><input type="checkbox" id="fig-png" ${ui.png ? 'checked' : ''}> include PNG (3×)</label>
        <span class="small muted">The archive contains one SVG + CSV (+ PNG) per figure and a captions file.</span></div></section>
    <h2 style="margin:8px 4px 0">Distributions</h2>
    <div class="grid grid-2">
      ${F('f-unif', 'Per-device uniformity', 'Violin (kernel density) with quartile bar and individual devices', '')}
      ${F('f-hwbox', 'Per-device metrics', 'Box plots of uniformity, reliability and steadiness (%)', '', has.rel)}
      ${F('f-ecdf', 'Empirical CDFs of fractional HD', 'Intra- vs inter-device distance distributions', '', has.id)}
      ${F('f-qq', 'Q-Q plot vs binomial model', 'Empirical inter-HD quantiles against Binomial(n, p̂) quantiles', '', !!r.inter_hd)}
      ${F('f-condbox', 'Per-device BER by operating condition', 'Box plot with individual devices (enrolment read excluded)', 'span-all', has.cond)}
    </div>
    <h2 style="margin:8px 4px 0">Identification &amp; reliability</h2>
    <div class="grid grid-2">
      ${F('f-roc', 'ROC curve', 'Genuine acceptance (1 − FRR) vs false acceptance, empirical and binomial', '', has.id)}
      ${F('f-len', 'Identification error vs response length', 'Binomial min-max(FAR, FRR) at the measured intra/inter rates', '', has.id)}
      ${F('f-tmv', 'Temporal majority voting', 'Residual BER after majority voting over m read-outs', '', has.rel)}
      ${F('f-profile', 'Bit-stability profile', 'Per-bit error rates sorted from least to most stable', '', has.rel)}
    </div>
    <h2 style="margin:8px 4px 0">Bit-level structure</h2>
    <div class="grid grid-2">
      ${F('f-polar', 'Polar bit-aliasing', 'P(bit = 1) for every bit position around the response; dashed ring = 50%')}
      ${F('f-entcum', 'Entropy accumulation', 'Cumulative min-entropy of bit positions sorted by entropy; dashed = ideal')}
      ${F('f-bitscatter', 'Bias vs instability per bit', 'Bit-aliasing deviation from 50% against per-bit error rate', '', has.rel)}
      ${F('f-devscatter', 'Uniformity vs reliability per device', 'Each point is a device, with least-squares fit', '', has.rel)}
    </div>
    <h2 style="margin:8px 4px 0">3D figures</h2>
    <div class="grid grid-2">
      ${F('f3-flip', 'Stability landscape', 'Flip rate per device × bit position (binned for large data sets)', '', has.rel)}
      ${F('f3-dev', 'Device quality space', 'Uniformity × reliability × steadiness for every device', '', has.rel)}
      ${F('f3-mat', 'Inter-device distance bars', `Pairwise fractional HD, first ${Math.min(D, 20)} devices`, '', D > 2)}
      ${F('f3-ident', 'Identification design space', 'log₁₀ identification error over response length × intra-device BER', '', has.id)}
    </div>
    <section class="card" aria-labelledby="f3-ecc-t"><div class="card-head"><div style="flex:1;min-width:200px"><h3 id="f3-ecc-t">Key-failure surface</h3><p class="card-sub">log₁₀ 128-bit key failure over BER × repetition for an outer code, at the measured min-entropy</p></div>
      <select id="fig-code" aria-label="Outer code" style="width:auto">${CODES.filter((c) => c[0] !== 'None').map((c) => `<option ${c[0] === ui.code ? 'selected' : ''}>${c[0]}</option>`).join('')}</select>
      <div class="chart-tools no-print"><button class="btn small ghost" data-act="csv" data-chart="f3-ecc">CSV</button><button class="btn small ghost" data-act="svg" data-chart="f3-ecc">SVG</button><button class="btn small ghost" data-act="png" data-chart="f3-ecc">PNG</button></div></div>
      <div class="chart" id="f3-ecc"></div></section>
  </div>`;
  FIGS.push({ id: 'f3-ecc', title: 'Key-failure surface', caption: `log10 key failure over BER × repetition (${ui.code})` });
  bindChartTools(root, ctx);

  // ---- distributions
  plot($('#f-unif'), { x: { label: 'Population', ticks: [0], format: () => esc(ds.name.slice(0, 24)) }, y: { label: 'Uniformity (%)' }, layers: [{ type: 'violin', x: [0], data: [r.uniformity.per_device], name: 'Uniformity', boxWidth: 0.7, points: true }, { type: 'hline', y: 50, label: 'ideal 50%' }] });
  if (has.rel) {
    const st = Array.from(steadiness(ds)), cats = ['Uniformity', 'Reliability', 'Steadiness'];
    plot($('#f-hwbox'), { x: { label: 'Metric', ticks: [0, 1, 2], format: (v) => cats[Math.round(v)] || '', tipFormat: (v) => cats[v] }, y: { label: 'Per-device value (%)' }, layers: [
      { type: 'box', x: [0], data: [r.uniformity.per_device], name: 'Uniformity', slot: 0, points: true },
      { type: 'box', x: [1], data: [r.reliability.per_device], name: 'Reliability', slot: 2, points: true },
      { type: 'box', x: [2], data: [st], name: 'Steadiness', slot: 6, points: true }], legend: false });
  }
  if (has.id) {
    const x = idx(N + 1).map((k) => k / N);
    plot($('#f-ecdf'), { x: { label: 'Fractional Hamming distance', domain: [0, 1] }, y: { label: 'Cumulative probability', domain: [0, 1] }, layers: [{ type: 'line', x, y: ecdfFromHist(r.intra_hd.histogram), name: 'Intra-device', slot: 0 }, { type: 'line', x, y: ecdfFromHist(r.inter_hd.histogram), name: 'Inter-device', slot: 1 }] });
  }
  if (r.inter_hd) {
    const cdf = ecdfFromHist(r.inter_hd.histogram), pm = binomPmfVector(N, r.inter_hd.fit.p); let c = 0; const bcdf = Array.from(pm, (v) => (c += v));
    const ps = idx(99).map((i) => (i + 1) / 100), emp = ps.map((p) => quantileFromCdf(cdf, p) / N), th = ps.map((p) => quantileFromCdf(bcdf, p) / N);
    const lo = Math.min(...emp, ...th), hi = Math.max(...emp, ...th);
    plot($('#f-qq'), { x: { label: 'Binomial quantile (fHD)' }, y: { label: 'Empirical quantile (fHD)' }, layers: [{ type: 'line', x: [lo, hi], y: [lo, hi], name: 'y = x', slot: 7, dash: '5 4' }, { type: 'scatter', x: th, y: emp, name: 'Inter-HD quantiles', slot: 1, r: 3.5 }] });
  }
  if (has.cond) {
    const { conds, data } = perDeviceConditionBer(ds);
    plot($('#f-condbox'), { x: { label: 'Operating condition', ticks: idx(conds.length), format: (v) => esc(conds[Math.round(v)] ?? ''), tipFormat: (v) => esc(conds[v]) }, y: { label: 'Per-device bit error rate' }, layers: [{ type: 'box', x: idx(conds.length), data, name: 'BER', slot: 1, points: true, boxWidth: 0.5 }], legend: false });
  }
  // ---- identification & reliability
  if (has.id) {
    const I = r.identification, fl = 1e-12, gx = (a) => a.map((v) => Math.max(v, fl));
    plot($('#f-roc'), { x: { label: 'False acceptance rate', type: 'log', domain: [fl, 1] }, y: { label: 'Genuine acceptance (1 − FRR)', domain: [0, 1.02] }, layers: [
      { type: 'line', x: gx(I.binomial.far_curve), y: I.binomial.frr_curve.map((v) => 1 - v), name: 'Binomial model', slot: 6 },
      { type: 'line', x: gx(I.far), y: I.frr.map((v) => 1 - v), name: 'Empirical', slot: 0, dash: '5 4' }] });
    const lens = [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024].filter((n) => n <= Math.max(256, 2 * N));
    const L = identificationVsLength(I.binomial.p_intra, I.binomial.p_inter, lens);
    plot($('#f-len'), { x: { label: 'Response length n (bits)', type: 'log', format: (v) => fmtNum(v, 0) }, y: { label: 'Identification error', type: 'log', domain: [Math.max(1e-300, Math.min(...L.error.filter((v) => v > 0)) / 10), 1] }, layers: [{ type: 'line', x: lens, y: L.error.map((v) => Math.max(v, 1e-300)), name: 'min-max(FAR, FRR)', slot: 0, markers: true }, { type: 'vline', x: N, label: `n = ${N}` }] });
  }
  if (has.rel) {
    const T = tmvBer(ds);
    plot($('#f-tmv'), { x: { label: 'Votes m', ticks: T.votes }, y: { label: 'Residual BER', type: 'log' }, layers: [{ type: 'line', x: T.votes, y: T.ber.map((v) => Math.max(v, 1e-12)), name: 'BER after TMV', slot: 2, markers: true }] });
    const sorted = [...r.ber.per_bit].sort((a, b) => a - b);
    plot($('#f-profile'), { x: { label: 'Bit rank (most → least stable)' }, y: { label: 'Bit error rate' }, layers: [{ type: 'area', x: idx(N), y: sorted, name: 'Sorted error rate', slot: 1 }, { type: 'hline', y: r.ber.mean, label: `mean ${fmt(r.ber.mean, 4)}` }] });
  }
  // ---- bit level
  polar($('#f-polar'), { values: r.bit_aliasing.per_bit, ref: 50, max: 100, label: 'bit-aliasing %', slot: 0, tip: (i, v) => `<div class="tip-head">bit ${i}</div>P(1) <b>${fmt(v, 1)}%</b>` });
  const ent = [...r.entropy.min_entropy_per_bit].sort((a, b) => b - a); let acc = 0; const cum = ent.map((v) => (acc += v));
  plot($('#f-entcum'), { x: { label: 'Bits used' }, y: { label: 'Cumulative min-entropy (bits)' }, layers: [{ type: 'line', x: idx(N + 1), y: idx(N + 1), name: 'Ideal (1 bit / bit)', slot: 7, dash: '5 4' }, { type: 'area', x: idx(N).map((i) => i + 1), y: cum, name: 'Measured', slot: 2 }] });
  if (has.rel) {
    const dev = r.bit_aliasing.per_bit.map((v) => Math.abs(v - 50));
    plot($('#f-bitscatter'), { x: { label: '|bit-aliasing − 50| (%)' }, y: { label: 'Per-bit error rate' }, layers: [{ type: 'scatter', x: dev, y: r.ber.per_bit, name: 'Bit positions', slot: 0, r: 3.5 }, ...fitLayer(dev, r.ber.per_bit)] });
    plot($('#f-devscatter'), { x: { label: 'Uniformity (%)' }, y: { label: 'Reliability (%)' }, layers: [{ type: 'scatter', x: r.uniformity.per_device, y: r.reliability.per_device, name: 'Devices', slot: 1 }, ...fitLayer(r.uniformity.per_device, r.reliability.per_device)] });
  }
  // ---- 3D
  if (has.rel) {
    const g = flipGrid(ds);
    surface3d($('#f3-flip'), { x: g.x, y: g.y, z: g.z, xLabel: 'bit', yLabel: 'device', zLabel: 'flip rate', zDomain: [0, Math.max(0.05, ...g.z.flat().filter((v) => v !== null))], tip: (i, j, v) => `<div class="tip-head">bits ${g.x[i]}–${g.x[i] + g.cb - 1} · devices ${g.y[j]}–${g.y[j] + g.rb - 1}</div>mean flip rate <b>${fmtNum(v, 4)}</b>` });
    const st = Array.from(steadiness(ds));
    scatter3d($('#f3-dev'), { series: [{ name: 'Devices', points: r.uniformity.per_device.map((u, i) => [u, r.reliability.per_device[i], st[i], ds.deviceIds[i]]), slot: 6 }], xLabel: 'uniformity %', yLabel: 'reliability %', zLabel: 'steadiness %' });
  }
  if (D > 2) {
    const n = Math.min(D, 20), M = r.inter_hd_matrix;
    bars3d($('#f3-mat'), { x: idx(n), y: idx(n), z: idx(n).map((j) => idx(n).map((i) => (i === j ? null : M[j][i]))), xLabel: 'device', yLabel: 'device', zLabel: 'fHD', zDomain: [Math.max(0, Math.min(...M.flat().filter((v, q) => q % (D + 1))) - 0.05), Math.max(...M.flat())], tip: (i, j, v) => `<div class="tip-head">${esc(ds.deviceIds[j])} ↔ ${esc(ds.deviceIds[i])}</div>fHD <b>${fmtNum(v, 4)}</b>` });
  }
  if (has.id) {
    const lens = [16, 32, 48, 64, 96, 128, 192, 256], ps = [0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.15], pInter = r.identification.binomial.p_inter;
    const z = ps.map((p) => lens.map((n) => { const m = binomialFarFrr(n, p, pInter); return Math.max(-40, Math.log10(Math.max(Math.max(m.far_at_threshold, m.frr_at_threshold), 1e-40))); }));
    surface3d($('#f3-ident'), { x: lens, y: ps, z, xLabel: 'bits n', yLabel: 'intra BER', zLabel: 'log₁₀ error', zDomain: [-40, 0], tip: (i, j, v) => `<div class="tip-head">n = ${lens[i]} · BER = ${ps[j]}</div>log₁₀ error <b>${fmt(v, 2)}</b>` });
  }
  {
    const [, n, k, t] = CODES.find((c) => c[0] === ui.code) || CODES[12], h = Math.min(1, r.entropy.min_entropy_mean);
    const reps = [1, 3, 5, 7, 9, 11, 13, 15], bers = idx(20).map((i) => 0.005 + i * 0.0125);
    const z = reps.map((rr) => bers.map((p) => { const bpb = n * rr, res = bpb * h - (bpb - k); if (res <= 0) return null; const B = Math.ceil(128 / res), pb = blockFailure(repetitionError(p, rr), n, t); const f = pb <= 0 ? 1e-40 : pb >= 1 ? 1 : -Math.expm1(B * Math.log1p(-pb)); return Math.max(-40, Math.log10(Math.max(f, 1e-40))); }));
    if (z.flat().some((v) => v !== null)) surface3d($('#f3-ecc'), { x: bers, y: reps, z, xLabel: 'BER p', yLabel: 'repetition', zLabel: 'log₁₀ failure', zDomain: [-40, 0], tip: (i, j, v) => `<div class="tip-head">p = ${fmt(bers[i], 3)} · r = ${reps[j]}</div>log₁₀ failure <b>${fmt(v, 2)}</b>` });
    else $('#f3-ecc').innerHTML = `<p class="muted">Helper data leaks all entropy for ${esc(ui.code)} at min-entropy ${fmt(h, 3)}; choose a lower-rate code.</p>`;
    $('#fig-code').onchange = (ev) => { ui.code = ev.target.value; figuresView(ctx, root); };
  }
  $('#fig-png').onchange = (ev) => { ui.png = ev.target.checked; };
  $('#fig-zip').onclick = async (ev) => {
    ev.target.disabled = true; const base = slug(ds.name), files = [], lines = [`Figures for "${ds.name}" — PUFAnalytics`, ''];
    try {
      for (const [i, f] of FIGS.entries()) {
        const c = $(`#${f.id}`); if (!c || !c.querySelector('svg')) continue;
        const stem = `${String(i + 1).padStart(2, '0')}-${f.id.replace(/^f3?-/, '')}`;
        files.push({ name: `${base}/svg/${stem}.svg`, data: svgString(c) });
        if (c._csv) files.push({ name: `${base}/csv/${stem}.csv`, data: c._csv() });
        if (ui.png) files.push({ name: `${base}/png/${stem}.png`, data: new Uint8Array(await (await pngBlob(c)).arrayBuffer()) });
        lines.push(`${stem}: ${f.title}. ${f.caption}.`);
      }
      files.push({ name: `${base}/captions.txt`, data: lines.join('\n') + '\n' });
      download(`${base}-figures.zip`, makeZip(files));
      toast(`Exported ${FIGS.length} figures`, 'success');
    } catch (err) { toast(`Export failed: ${err.message}`, 'error'); } finally { ev.target.disabled = false; }
  };
}

// ================================================================= SIMULATION STUDIO
export function parseValues(text) {
  const t = String(text).trim();
  const m = /^(log:)?\s*([-\d.eE+]+)\s*:\s*([-\d.eE+]+)\s*:\s*(\d+)$/.exec(t);
  if (m) {
    const a = +m[2], b = +m[3], n = Math.max(2, Math.min(40, +m[4]));
    if (m[1]) { if (a <= 0 || b <= 0) throw new Error('log ranges need positive bounds'); return idx(n).map((i) => +(a * (b / a) ** (i / (n - 1))).toPrecision(6)); }
    return idx(n).map((i) => +(a + ((b - a) * i) / (n - 1)).toPrecision(8));
  }
  const v = t.split(/[,\s]+/).filter(Boolean).map(Number);
  if (!v.length || v.some((x) => !Number.isFinite(x))) throw new Error(`Cannot parse values “${t}”`);
  return v.slice(0, 40);
}
const PRETTY = { n_devices: 'devices', n_bits: 'response bits', n_repeats: 'repeats' };
function paramOptions(model) { return [...BASE_PARAMS, ...MODEL_PARAMS[model].filter((p) => p[3] !== null).map((p) => p[0])]; }
function pyList(v) { return `[${v.join(', ')}]`; }

export function sweepView(ctx, root) {
  const ui = ctx.state.ui.sw || (ctx.state.ui.sw = { model: 'sram', n_devices: 24, n_bits: 128, n_repeats: 4, seed: 1, seeds: 5, p1: 'noise', v1: '0.02:0.5:8', p2: '', v2: '16,32,64,128', metric: 'reliability', res: null, params: {} });
  const opts = paramOptions(ui.model);
  if (!opts.includes(ui.p1)) ui.p1 = opts.includes('noise') ? 'noise' : opts[0];
  if (ui.p2 && !opts.includes(ui.p2)) ui.p2 = '';
  const res = ui.res, two = res && res.param2;
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <section class="card" aria-labelledby="sw-t">
      <div class="card-head"><div><h2 id="sw-t">Simulation studio</h2><p class="card-sub">Monte-Carlo parameter sweeps: every grid point is simulated with several seeds (common random numbers) and summarised by mean ± 95% interval. Sweep one parameter for curves or two for 3D response surfaces.</p></div></div>
      <form id="sw-form" class="stack">
        <div class="seg" role="group" aria-label="PUF model">${Object.entries(MODEL_NAMES).map(([k, l]) => `<button type="button" data-swmodel="${k}" aria-pressed="${ui.model === k}">${l}</button>`).join('')}</div>
        <div class="form-grid">
          <label class="field"><span>Devices</span><input type="number" name="n_devices" min="2" max="500" value="${ui.n_devices}"></label>
          <label class="field"><span>Response bits</span><input type="number" name="n_bits" min="8" max="4096" value="${ui.n_bits}"></label>
          <label class="field"><span>Repeats</span><input type="number" name="n_repeats" min="2" max="50" value="${ui.n_repeats}"></label>
          <label class="field"><span>Seeds per point</span><input type="number" name="seeds" min="1" max="50" value="${ui.seeds}"></label>
          <label class="field"><span>First seed</span><input type="number" name="seed" value="${ui.seed}"></label>
        </div>
        <div class="form-grid">${MODEL_PARAMS[ui.model].map(([k, l, v, step, help]) => step === null ? `<label class="field"><span>${l}</span><select name="p_${k}"><option ${ui.params[k] === 'neighbor' ? 'selected' : ''}>neighbor</option><option ${ui.params[k] === 'disjoint' ? 'selected' : ''}>disjoint</option></select><small>${help}</small></label>` : `<label class="field"><span>${l}</span><input type="number" name="p_${k}" step="${step}" value="${ui.params[k] ?? v}"><small>${help} (fixed unless swept)</small></label>`).join('')}</div>
        <div class="grid grid-2" style="gap:16px">
          <div class="inset stack"><b>Sweep parameter 1 (x-axis)</b>
            <select name="p1">${opts.map((o) => `<option value="${o}" ${o === ui.p1 ? 'selected' : ''}>${PRETTY[o] || o}</option>`).join('')}</select>
            <input type="text" name="v1" value="${esc(ui.v1)}" aria-label="Values for parameter 1"><small class="muted">List <code>0.01,0.05,0.1</code>, range <code>start:stop:steps</code> or <code>log:start:stop:steps</code></small></div>
          <div class="inset stack"><b>Sweep parameter 2 (optional, gives a 3D surface)</b>
            <select name="p2"><option value="">— none —</option>${opts.map((o) => `<option value="${o}" ${o === ui.p2 ? 'selected' : ''}>${PRETTY[o] || o}</option>`).join('')}</select>
            <input type="text" name="v2" value="${esc(ui.v2)}" aria-label="Values for parameter 2"><small class="muted">Same syntax; ignored when no second parameter is chosen</small></div>
        </div>
        <div class="row"><button class="btn primary" type="submit">${ICONS.play} Run sweep</button><span class="small muted" id="sw-cost"></span></div>
      </form>
    </section>
    ${res ? `<section class="card"><div class="card-head"><div style="flex:1;min-width:200px"><h2>Results · ${esc(MODEL_NAMES[res.model])}</h2><p class="card-sub">${res.seeds} seed(s) per point${two ? ` · ${res.values.length} × ${res.values2.length} grid` : ` · ${res.values.length} points`}</p></div>
      <button class="btn small" id="sw-csv">${ICONS.download} CSV</button><button class="btn small" id="sw-py">${ICONS.download} Python script</button></div>
      ${two ? `<div class="seg" role="group" aria-label="Metric">${METRICS.map(([k, l]) => `<button type="button" data-swmetric="${k}" aria-pressed="${ui.metric === k}">${l}</button>`).join('')}</div>` : ''}</section>
    ${two ? `<div class="grid grid-2">${chartCard('sw-3d', `${METRICS.find((m) => m[0] === ui.metric)[1]} surface`, `${PRETTY[res.param] || res.param} × ${PRETTY[res.param2] || res.param2} (drag to rotate)`)}${chartCard('sw-heat', 'Heatmap view', 'Same grid, colour = metric value')}${chartCard('sw-lines', 'Slices', `One curve per ${PRETTY[res.param2] || res.param2} value (± 95% interval)`, 'span-all')}</div>`
      : `<div class="grid grid-2">${METRICS.map(([k, l]) => chartCard(`sw-${k}`, l, `vs ${PRETTY[res.param] || res.param}; band = 95% interval of the mean`)).join('')}</div>`}` : ''}
  </div>`;
  bindChartTools(root, ctx);
  const form = $('#sw-form');
  const collect = () => {
    const f = new FormData(form);
    Object.assign(ui, { n_devices: +f.get('n_devices'), n_bits: +f.get('n_bits'), n_repeats: +f.get('n_repeats'), seeds: Math.max(1, +f.get('seeds') | 0), seed: +f.get('seed') | 0, p1: f.get('p1'), v1: f.get('v1'), p2: f.get('p2'), v2: f.get('v2') });
    for (const [k, , , step] of MODEL_PARAMS[ui.model]) ui.params[k] = step === null ? f.get(`p_${k}`) : +f.get(`p_${k}`);
  };
  const cost = () => {
    try { collect(); const n1 = parseValues(ui.v1).length, n2 = ui.p2 ? parseValues(ui.v2).length : 1; $('#sw-cost').textContent = `${n1 * n2 * ui.seeds} simulations of ${ui.n_devices} × ${ui.n_repeats} × ${ui.n_bits} bits`; } catch (err) { $('#sw-cost').textContent = err.message; }
  };
  cost(); form.oninput = cost;
  $$('[data-swmodel]').forEach((b) => (b.onclick = () => { collect(); ui.model = b.dataset.swmodel; ui.params = {}; sweepView(ctx, root); }));
  form.onsubmit = async (ev) => {
    ev.preventDefault(); collect();
    let v1, v2 = null;
    try { v1 = parseValues(ui.v1); if (ui.p2) { if (ui.p2 === ui.p1) throw new Error('Choose two different parameters'); v2 = parseValues(ui.v2); } } catch (err) { return toast(err.message, 'error'); }
    const work = v1.length * (v2 ? v2.length : 1) * ui.seeds * ui.n_devices * ui.n_repeats * ui.n_bits * (['arbiter', 'ff_arbiter', 'interpose'].includes(ui.model) ? (ui.params.stages || 64) / 8 : 1);
    if (work > 4e9) return toast('This sweep is very large; reduce grid points, seeds or population size.', 'error');
    const params = { ...ui.params }; for (const k of ['stages', 'xor', 'loops', 'x', 'y']) if (k in params) params[k] = Math.max(k === 'loops' ? 0 : 1, params[k] | 0);
    ev.submitter.disabled = true;
    try {
      ui.res = await ctx.runTask('sweep', { model: ui.model, param: ui.p1, values: v1, param2: ui.p2 || null, values2: v2, seeds: ui.seeds, seed: ui.seed, n_devices: ui.n_devices, n_bits: ui.n_bits, n_repeats: ui.n_repeats, params });
      ui.res.params = params; ui.res.base = { n_devices: ui.n_devices, n_bits: ui.n_bits, n_repeats: ui.n_repeats };
      toast('Sweep finished', 'success'); sweepView(ctx, root);
    } catch (err) { toast(err.message, 'error'); ev.submitter.disabled = false; }
  };
  if (!res) return;
  const ci = (k, j, i) => (1.96 * res.std[k][j][i]) / Math.sqrt(res.seeds);
  const xl = PRETTY[res.param] || res.param, logx = res.values.every((v) => v > 0) && Math.max(...res.values) / Math.min(...res.values) > 50;
  if (!two) {
    for (const [k, l] of METRICS) {
      const y = res.mean[k][0];
      plot($(`#sw-${k}`), { height: 240, x: { label: xl, type: logx ? 'log' : 'linear' }, y: { label: l }, layers: [
        { type: 'band', x: res.values, y0: y.map((v, i) => v - ci(k, 0, i)), y1: y.map((v, i) => v + ci(k, 0, i)), slot: 0 },
        { type: 'line', x: res.values, y, name: l, slot: 0, markers: true }] });
    }
  } else {
    const k = ui.metric, l = METRICS.find((m) => m[0] === k)[1], z = res.mean[k], yl = PRETTY[res.param2] || res.param2;
    const vals = z.flat().filter(Number.isFinite);
    surface3d($('#sw-3d'), { x: res.values, y: res.values2, z, xLabel: xl, yLabel: yl, zLabel: l, zDomain: vals.length ? [Math.min(...vals), Math.max(...vals)] : undefined, tip: (i, j, v) => `<div class="tip-head">${xl} = ${fmtNum(res.values[i], 4)} · ${yl} = ${fmtNum(res.values2[j], 4)}</div>${l} <b>${fmtNum(v, 4)}</b> ± ${fmtNum(ci(k, j, i), 3)}` });
    heatmap($('#sw-heat'), { rows: res.values2.length, cols: res.values.length, value: (rr, c) => z[rr][c], domain: vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1], scale: 'sequential', xLabel: `${xl} (index)`, yLabel: yl, yTick: (t) => fmtNum(res.values2[t], 3), legendLabel: l, tip: (rr, c, v) => `<div class="tip-head">${xl} = ${fmtNum(res.values[c], 4)} · ${yl} = ${fmtNum(res.values2[rr], 4)}</div>${l} <b>${fmtNum(v, 4)}</b>`, height: Math.max(220, res.values2.length * 26 + 80) });
    plot($('#sw-lines'), { height: 300, x: { label: xl, type: logx ? 'log' : 'linear' }, y: { label: l }, layers: res.values2.slice(0, 8).flatMap((v2, j) => [
      { type: 'band', x: res.values, y0: z[j].map((v, i) => v - ci(k, j, i)), y1: z[j].map((v, i) => v + ci(k, j, i)), slot: j, opacity: 0.1 },
      { type: 'line', x: res.values, y: z[j], name: `${yl} = ${fmtNum(v2, 4)}`, slot: j, markers: true }]) });
    $$('[data-swmetric]').forEach((b) => (b.onclick = () => { ui.metric = b.dataset.swmetric; sweepView(ctx, root); }));
  }
  $('#sw-csv').onclick = () => {
    const rows = [[res.param, ...(two ? [res.param2] : []), ...METRICS.flatMap(([k]) => [`${k}_mean`, `${k}_std`])].join(',')];
    (two ? res.values2 : [null]).forEach((b, j) => res.values.forEach((a, i) => rows.push([a, ...(two ? [b] : []), ...METRICS.flatMap(([k]) => [res.mean[k][j][i], res.std[k][j][i]])].map((v) => (Number.isFinite(v) ? v : '')).join(','))));
    download(`sweep-${res.model}-${res.param}${two ? `-${res.param2}` : ''}.csv`, rows.join('\n') + '\n', 'text/csv');
  };
  $('#sw-py').onclick = () => {
    const kw = Object.entries(res.params).filter(([k]) => k !== res.param && k !== res.param2).map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : v}`);
    const py = `"""Reproduce the PUFAnalytics Simulation-studio sweep (identical numbers)."""
import pufanalytics as pa

res = pa.sweep(
    ${JSON.stringify(res.model)}, ${JSON.stringify(res.param)}, ${pyList(res.values)},${two ? `\n    param2=${JSON.stringify(res.param2)}, values2=${pyList(res.values2)},` : ''}
    seeds=${res.seeds}, seed=${res.seed}, n_devices=${res.base.n_devices}, n_bits=${res.base.n_bits}, n_repeats=${res.base.n_repeats},${kw.length ? `\n    ${kw.join(', ')},` : ''}
)
for key, label in pa.sweeps.METRICS:
    print(label, res["mean"][key].round(4).tolist())
`;
    download(`sweep_${res.model}_${res.param}.py`, py, 'text/x-python');
  };
}
