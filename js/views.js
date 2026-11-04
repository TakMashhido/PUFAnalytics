// View renderers. Each view receives the app context and its root element.
import { $, $$, esc, ICONS, toast, download, copyText, fmt, slug, statusBadge } from './ui.js';
import { plot, heatmap, radar, gauge, svgString, pngBlob, fmtNum } from './charts.js';
import { parseText, fromDict, toCSV, toDict, makeDataset, measurement, reference, datasetSummary, subsetDevices } from './core/dataset.js';
import { parseNpy } from './core/npy.js';
import { planKeyGeneration, repetitionError, blockFailure, CODES } from './core/ecc.js';
import { toMarkdown, toLatex, toJSON, toPython, BIBTEX, scores, qualityIndex, status, VERSION } from './report.js';
import { renderDocs } from './docs.js';
import { surface3d } from './charts3d.js';
import { figuresView, sweepView } from './views2.js';

// ----------------------------------------------------------------- shared bits
export function chartCard(id, title, sub = '', cls = '', extra = '') {
  return `<section class="card ${cls}" aria-labelledby="${id}-t">
    <div class="card-head"><div style="flex:1;min-width:180px"><h3 id="${id}-t">${title}</h3>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div>
      <div class="chart-tools no-print">${extra}
        <button class="btn small ghost" data-act="table" data-chart="${id}" aria-label="Show data table">${ICONS.table}</button>
        <button class="btn small ghost" data-act="csv" data-chart="${id}" aria-label="Download CSV">CSV</button>
        <button class="btn small ghost" data-act="svg" data-chart="${id}" aria-label="Download SVG">SVG</button>
        <button class="btn small ghost" data-act="png" data-chart="${id}" aria-label="Download PNG">PNG</button>
      </div></div>
    <div class="chart" id="${id}"></div><div class="chart-table" id="${id}-table" hidden></div></section>`;
}
export function bindChartTools(root, ctx) {
  root.onclick = async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b || !b.dataset.chart) return;
    const c = $(`#${b.dataset.chart}`), name = `${slug(ctx.active()?.ds.name || 'chart')}-${b.dataset.chart}`;
    if (!c) return;
    if (b.dataset.act === 'csv' && c._csv) download(`${name}.csv`, c._csv(), 'text/csv');
    if (b.dataset.act === 'svg') download(`${name}.svg`, svgString(c), 'image/svg+xml');
    if (b.dataset.act === 'png') download(`${name}.png`, await pngBlob(c));
    if (b.dataset.act === 'table') {
      const t = $(`#${b.dataset.chart}-table`);
      if (t.hidden) { t.innerHTML = c._table ? c._table() : `<pre class="code">${esc(c._csv ? c._csv().split('\n').slice(0, 200).join('\n') : '')}</pre>`; t.hidden = false; } else t.hidden = true;
    }
  };
}
export const needData = (ctx, root, what = 'this analysis') => {
  const e = ctx.active();
  if (!e) { root.innerHTML = `<div class="card empty">${ICONS.chip}<h2>No dataset yet</h2><p class="muted">Simulate a PUF population or import measurements to run ${what}.</p><div class="btn-group" style="justify-content:center"><a class="btn primary" href="#/data">${ICONS.data} Go to data</a><button class="btn" id="demo-btn">${ICONS.play} Load demo population</button></div></div>`; $('#demo-btn').onclick = () => loadDemo(ctx); return null; }
  if (!e.result) { root.innerHTML = '<div class="card empty"><h2>Analysing…</h2><p class="muted">Metrics are being computed in a background thread.</p></div>'; return null; }
  return e;
};
export async function loadDemo(ctx, go = 'overview') {
  const ds = await ctx.runTask('simulate', { model: 'arbiter', n_devices: 32, n_bits: 128, n_repeats: 4, seed: 2024, conditions: [['25C', 1], ['-40C', 1.8], ['85C', 2.6]], params: { stages: 64, xor: 1, noise: 0.06 } });
  ds.name = 'Demo · 64-stage Arbiter PUF';
  await ctx.addDataset(ds, { go });
}
export const idx = (n) => Array.from({ length: n }, (_, i) => i);
const pct = (v) => fmt(v, 2);

// ================================================================= OVERVIEW
function overview(ctx, root) {
  const e = ctx.active();
  if (!e || !e.result) {
    root.innerHTML = `
    <section class="card hero">
      <div>
        <span class="chip accent">v${VERSION} · open source · runs offline</span>
        <h1 style="margin-top:14px">Evaluate Physically Unclonable Functions with research-grade rigour.</h1>
        <p class="lead">Import measurements or simulate PUF populations, then get standard quality metrics with bootstrap confidence intervals, identification error rates, NIST SP 800-22 randomness tests, SP 800-90B entropy estimates, machine-learning attack curves and fuzzy-extractor sizing. Every number can be reproduced with the companion Python package.</p>
        <div class="btn-group" style="margin-top:10px">
          <button class="btn primary" id="demo-btn">${ICONS.play} Explore a demo population</button>
          <a class="btn" href="#/data">${ICONS.upload} Import your data</a>
          <a class="btn ghost" href="#/docs">${ICONS.docs} Methods</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">${heroArt()}</div>
    </section>
    <div class="feature-list" style="margin-top:26px">
      ${[['metrics', 'Standard metric suite', 'Uniformity, uniqueness, reliability, bit-aliasing, steadiness and stable-bit ratio, with 95% bootstrap CIs.', 1],
        ['id', 'Identification analysis', "Intra/inter HD distributions, binomial fits, decidability d', empirical EER and extrapolated FAR/FRR.", 2],
        ['random', 'Randomness & entropy', 'Eight NIST SP 800-22 tests, SP 800-90B MCV and Markov min-entropy, LZ complexity and bit correlations.', 3],
        ['attack', 'Attack lab', 'Logistic-regression modelling attacks on (XOR) Arbiter PUFs with learning curves on simulated or your own CRPs.', 7],
        ['image', 'Figure studio', 'Eighteen publication figures — violins, box plots, ECDF, Q-Q, ROC, polar and interactive 3D surfaces — exported as one zip.', 6],
        ['dice', 'Simulation studio', 'Monte-Carlo parameter sweeps over seven PUF models with confidence bands and 3D response surfaces.', 8],
        ['key', 'Key-generation planner', 'Size repetition + BCH/Golay/Reed–Muller fuzzy extractors for a target key failure rate.', 4],
        ['report', 'Publication output', 'SVG/PNG figures, LaTeX tables, Markdown and JSON reports, plus a Python script that reproduces every number.', 5]]
        .map(([ic, t, d, s]) => `<div class="feature"><div class="ico" style="color:var(--series-${s === 8 ? 1 : s})">${ICONS[ic]}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}
    </div>`;
    $('#demo-btn').onclick = async (ev) => { ev.target.disabled = true; await loadDemo(ctx); };
    return;
  }
  const r = e.result, s = datasetSummary(e.ds), q = qualityIndex(r), sc = scores(r);
  const ci = r.confidence_intervals || {};
  const ciTxt = (k) => (ci[k] ? `95% CI ${fmt(ci[k].low)}–${fmt(ci[k].high)}` : '');
  const kpis = [
    ['Uniformity', r.uniformity.mean, '%', 50, 0, 100, status('uniformity', r.uniformity.mean), ciTxt('uniformity') || 'ideal 50%'],
    ['Uniqueness', r.uniqueness?.mean, '%', 50, 0, 100, status('uniqueness', r.uniqueness?.mean), ciTxt('uniqueness') || 'needs ≥ 2 devices'],
    ['Reliability', r.reliability?.mean, '%', 100, 50, 100, status('reliability', r.reliability?.mean), r.reliability ? ciTxt('reliability') : 'needs repeated reads'],
    ['Bit-aliasing σ', r.bit_aliasing.std, '%', 0, 0, 50, r.bit_aliasing.std < 10 ? 'good' : r.bit_aliasing.std < 20 ? 'fair' : 'poor', `mean ${fmt(r.bit_aliasing.mean)}% · ideal σ→0`],
    ['Min-entropy', r.entropy.min_entropy_mean, ' bit', 1, 0, 1, status('entropy', r.entropy.min_entropy_mean), `MCV ${fmt(r.entropy.mcv_min_entropy, 3)} · Markov ${fmt(r.entropy.markov_min_entropy, 3)}`],
    ["Decidability d'", r.identification?.decidability, '', 10, 0, 12, status('decidability', r.identification?.decidability), r.identification ? `EER ${fmt(r.identification.eer, 4)}` : 'needs repeats & ≥ 2 devices'],
  ];
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <div class="grid grid-2">
      <section class="card" aria-labelledby="qi-t">
        <div class="card-head"><div><h2 id="qi-t">${esc(e.ds.name)}</h2><p class="card-sub">${s.devices} devices · ${s.bits}-bit responses · ${s.measurements} measurements · ${s.conditions.map(esc).join(', ')}</p></div></div>
        <div class="row" style="gap:22px;align-items:center">
          <div class="score-ring">${bigRing(q)}<div class="num"><div>${fmt(q, 0)}<small>quality index</small></div></div></div>
          <div class="stack" style="flex:1;min-width:200px">
            <div>${statusBadge(status('index', q), status('index', q) === 'good' ? 'Strong PUF' : status('index', q) === 'fair' ? 'Usable with care' : 'Weak PUF')}</div>
            <p class="small muted" style="margin:0">Heuristic summary of the seven normalised scores in the radar (see <a href="#/docs">Methods</a>). Report the individual metrics in publications.</p>
            <div class="btn-group"><a class="btn small" href="#/metrics">${ICONS.metrics} Metrics</a><a class="btn small" href="#/report">${ICONS.report} Report</a></div>
          </div>
        </div>
        <div class="tiles" style="margin-top:20px">
          <div class="tile"><div class="t-label">NIST SP 800-22</div><div class="t-value">${r.nist ? `${r.nist.tests.filter((t) => t.passed).length}/${r.nist.tests.filter((t) => t.applicable).length}` : '–'}</div><span class="small muted">tests passed</span></div>
          <div class="tile"><div class="t-label">Mean BER</div><div class="t-value">${r.ber ? fmt(r.ber.mean * 100, 2) + '%' : '–'}</div><span class="small muted">${r.conditions && Object.keys(r.conditions).length > 1 ? `worst ${fmt(Math.max(...Object.values(r.conditions).map((c) => c.ber)) * 100, 2)}%` : 'vs enrolment'}</span></div>
          <div class="tile"><div class="t-label">Stable bits</div><div class="t-value">${r.stable_bits !== undefined ? fmt(r.stable_bits * 100, 1) + '%' : '–'}</div><span class="small muted">never flipped</span></div>
          <div class="tile"><div class="t-label">Model FAR @ t*</div><div class="t-value">${r.identification ? fmtNum(r.identification.binomial.far) : '–'}</div><span class="small muted">${r.identification ? `t* = ${r.identification.binomial.threshold} bits` : ''}</span></div>
        </div>
      </section>
      ${chartCard('radar', 'Quality fingerprint', 'Normalised 0–100 scores; outer ring is ideal')}
    </div>
    <div class="kpis">${kpis.map(([l, v, u, ideal, lo, hi, st, foot]) => `<div class="kpi">${gauge(v ?? lo, ideal, lo, hi, v === undefined || v === null || Number.isNaN(v) ? 'na' : st)}<div class="kpi-body"><div class="kpi-label">${l} ${statusBadge(v === undefined || Number.isNaN(v) ? 'na' : st)}</div><div class="kpi-value">${v === undefined ? '–' : fmt(v, l === 'Min-entropy' ? 3 : 2)}<small>${v === undefined ? '' : u}</small></div><div class="kpi-foot">${foot}</div></div></div>`).join('')}</div>
    <div class="grid grid-2">
      ${chartCard('ov-hd', 'Hamming distance distributions', 'Intra-device (noise) vs inter-device (uniqueness), fractional HD')}
      ${chartCard('ov-bitmap', 'Enrolled responses', 'Each row is a device, each column a response bit')}
    </div>
  </div>`;
  bindChartTools(root, ctx);
  radar($('#radar'), { axes: Object.keys(sc), series: [{ name: e.ds.name, values: Object.values(sc) }], ariaLabel: 'Quality fingerprint radar' });
  hdChart($('#ov-hd'), r, false);
  bitmap($('#ov-bitmap'), e.ds, 'first');
}
function bigRing(q) {
  const r = 64, c = 2 * Math.PI * r, t = Math.max(0, Math.min(1, (q || 0) / 100));
  return `<svg viewBox="0 0 150 150" width="150" height="150" aria-hidden="true"><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--track)" stroke-width="13"/><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--accent)" stroke-width="13" stroke-linecap="round" stroke-dasharray="${t * c} ${c}" transform="rotate(-90 75 75)"/></svg>`;
}
function heroArt() {
  let cells = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const on = ((r * 7 + c * 13 + r * c) % 5) < 2; cells += `<rect x="${92 + c * 22}" y="${92 + r * 22}" width="18" height="18" rx="5" fill="${on ? 'var(--accent)' : 'var(--clay-2)'}" ${on ? 'opacity=".9"' : ''}/>`; }
  return `<svg viewBox="0 0 360 360"><rect x="60" y="60" width="240" height="240" rx="42" fill="var(--clay)"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${90 + i * 32}" y="26" width="14" height="40" rx="7" fill="var(--clay-2)"/><rect x="${90 + i * 32}" y="294" width="14" height="40" rx="7" fill="var(--clay-2)"/><rect x="26" y="${90 + i * 32}" width="40" height="14" rx="7" fill="var(--clay-2)"/><rect x="294" y="${90 + i * 32}" width="40" height="14" rx="7" fill="var(--clay-2)"/>`).join('')}${cells}</svg>`;
}

// ---------------------------------------------------------------- chart helpers
function hdChart(c, r, logY, slots = [1, 2]) {
  const N = r.meta.bits, x = idx(N + 1).map((k) => k / N), layers = [];
  const norm = (h) => { const t = h.reduce((a, b) => a + b, 0); return h.map((v) => (t ? v / t : 0)); };
  const lo = 1e-6;
  if (r.intra_hd) {
    layers.push({ type: 'bar', x, y: norm(r.intra_hd.histogram).map((v) => (logY && v <= 0 ? null : v)), name: 'Intra-HD', slot: slots[0] - 1, opacity: 0.85 });
    layers.push({ type: 'line', x, y: binomPmf(N, r.intra_hd.fit.p).map((v) => (logY && v < lo ? null : v)), name: 'Intra binomial fit', slot: slots[0] - 1, dash: '4 3' });
  }
  if (r.inter_hd) {
    layers.push({ type: 'bar', x, y: norm(r.inter_hd.histogram).map((v) => (logY && v <= 0 ? null : v)), name: 'Inter-HD', slot: slots[1] - 1, opacity: 0.85 });
    layers.push({ type: 'line', x, y: binomPmf(N, r.inter_hd.fit.p).map((v) => (logY && v < lo ? null : v)), name: 'Inter binomial fit', slot: slots[1] - 1, dash: '4 3' });
  }
  plot(c, { height: 280, x: { label: 'Fractional Hamming distance', domain: [0, 1], format: (v) => fmtNum(v, 2) }, y: { label: 'Probability', type: logY ? 'log' : 'linear', domain: logY ? [lo, 1] : undefined }, layers, ariaLabel: 'Hamming distance distributions' });
}
function binomPmf(n, p) {
  const out = []; let lg = [0]; for (let i = 1; i <= n; i++) lg.push(lg[i - 1] + Math.log(i));
  for (let k = 0; k <= n; k++) {
    if (p <= 0) out.push(k === 0 ? 1 : 0); else if (p >= 1) out.push(k === n ? 1 : 0);
    else out.push(Math.exp(lg[n] - lg[k] - lg[n - k] + k * Math.log(p) + (n - k) * Math.log1p(-p)));
  }
  return out;
}
function bitmap(c, ds, mode = 'first', meas = 0) {
  const D = ds.devices.length, N = ds.nBits;
  if (mode === 'stability') {
    const fr = (d, i) => { const R = ds.nMeas[d]; if (R < 2) return null; let f = 0; const a = ds.devices[d]; for (let m = 1; m < R; m++) f += a[m * N + i] !== a[i]; return f / (R - 1); };
    return heatmap(c, { rows: D, cols: N, value: fr, domain: [0, 0.5], scale: 'sequential', xLabel: 'Bit position', yLabel: 'Device', legendLabel: 'flip rate vs enrolment', yTick: (t) => ds.deviceIds[t], tip: (r, cc, v) => `<div class="tip-head">${esc(ds.deviceIds[r])} · bit ${cc}</div>flip rate <b>${fmtNum(v, 3)}</b>`, ariaLabel: 'Bit stability map' });
  }
  const ref = mode === 'majority' ? reference(ds, 'majority') : null;
  const val = (d, i) => (ref ? ref[d * N + i] : (meas < ds.nMeas[d] ? measurement(ds, d, meas)[i] : null));
  heatmap(c, { rows: D, cols: N, value: val, domain: [0, 1], scale: 'binary', xLabel: 'Bit position', yLabel: 'Device', yTick: (t) => ds.deviceIds[t], tip: (r, cc, v) => `<div class="tip-head">${esc(ds.deviceIds[r])} · bit ${cc}</div>value <b>${v ?? '–'}</b>`, ariaLabel: 'Response bitmap' });
}

// ================================================================= DATA
export const MODEL_PARAMS = {
  arbiter: [['stages', 'Stages k', 64, 1, 'Delay stages per chain'], ['xor', 'XOR chains', 1, 1, '1 = plain Arbiter PUF'], ['noise', 'Noise σ', 0.05, 0.01, 'relative to delay σ = 1']],
  ro: [['sigma_process', 'Process σ', 1, 0.1, 'random frequency variation'], ['noise', 'Noise σ', 0.1, 0.01, 'per measurement'], ['gradient', 'Systematic gradient', 0, 0.5, 'deterministic across chips'], ['pairing', 'Pairing', 'neighbor', null, 'neighbor | disjoint']],
  sram: [['noise', 'Noise σ', 0.1, 0.01, 'relative to mismatch σ = 1'], ['bias', 'Cell bias', 0, 0.05, 'technology skew (0 = balanced)']],
  ideal: [['flip_prob', 'Flip probability', 0.02, 0.005, 'per bit per re-read']],
  ff_arbiter: [['stages', 'Stages k', 64, 1, 'Delay stages'], ['loops', 'Feed-forward loops', 1, 1, 'evenly spaced, non-overlapping'], ['noise', 'Noise σ', 0.05, 0.01, 'relative to stage delay σ = 1']],
  interpose: [['stages', 'Stages k', 64, 1, 'Upper chain stages'], ['x', 'Upper XOR x', 1, 1, 'chains in the upper layer'], ['y', 'Lower XOR y', 1, 1, 'chains in the lower layer'], ['noise', 'Noise σ', 0.05, 0.01, 'relative to delay σ = 1']],
  dram: [['noise', 'Noise σ', 0.1, 0.01, 'read-out noise'], ['threshold', 'Decay threshold', 0, 0.05, 'in σ units (0 → 50% decay)'], ['temp_shift', 'Temperature shift', 0.3, 0.05, 'threshold shift per ln(scale)']],
};
export const MODEL_NAMES = { arbiter: 'Arbiter / XOR', ff_arbiter: 'Feed-forward', interpose: 'Interpose', ro: 'Ring oscillator', sram: 'SRAM', dram: 'DRAM', ideal: 'Ideal' };
const COND_PRESETS = { nominal: [['nominal', 1]], temp: [['25C', 1], ['-40C', 1.8], ['85C', 2.6]], volt: [['1.20V', 1], ['1.08V', 1.6], ['1.32V', 1.5]], corners: [['25C/1.20V', 1], ['-40C/1.08V', 2.2], ['85C/1.08V', 2.8], ['85C/1.32V', 2.4]] };

function dataView(ctx, root) {
  const ui = ctx.state.ui.sim || (ctx.state.ui.sim = { model: 'arbiter', conds: COND_PRESETS.temp.map((x) => x.slice()) });
  const e = ctx.active();
  root.innerHTML = `
  <div class="grid grid-2">
    <section class="card" aria-labelledby="sim-t">
      <div class="card-head"><div><h2 id="sim-t">Simulate a PUF population</h2><p class="card-sub">Seeded and reproducible: the Python package regenerates identical bits.</p></div></div>
      <form id="sim-form" class="stack">
        <div class="seg" role="group" aria-label="PUF model">${Object.entries(MODEL_NAMES).map(([k, l]) => `<button type="button" data-model="${k}" aria-pressed="${ui.model === k}">${l}</button>`).join('')}</div>
        <div class="form-grid">
          <label class="field"><span>Devices</span><input type="number" name="n_devices" min="2" max="2000" value="32" required></label>
          <label class="field"><span>Response bits</span><input type="number" name="n_bits" min="8" max="16384" value="128" required></label>
          <label class="field"><span>Repeats / condition</span><input type="number" name="n_repeats" min="1" max="200" value="4" required></label>
          <label class="field"><span>Seed</span><div class="row" style="flex-wrap:nowrap;gap:6px"><input type="number" name="seed" value="${Math.floor(Math.random() * 1e6)}" required><button type="button" class="btn icon" id="reseed" aria-label="Random seed">${ICONS.dice}</button></div></label>
        </div>
        <div class="form-grid" id="model-params">${MODEL_PARAMS[ui.model].map(([k, l, v, step, help]) => step === null ? `<label class="field"><span>${l}</span><select name="p_${k}"><option value="neighbor">neighbor</option><option value="disjoint">disjoint</option></select><small>${help}</small></label>` : `<label class="field"><span>${l}</span><input type="number" name="p_${k}" value="${v}" step="${step}"><small>${help}</small></label>`).join('')}</div>
        <div class="inset stack" style="gap:10px">
          <div class="row"><b class="small">Operating conditions</b><span class="spacer"></span>
            <select id="cond-preset" aria-label="Condition preset" style="width:auto;min-height:34px;padding:4px 34px 4px 12px"><option value="">Presets…</option><option value="nominal">Nominal only</option><option value="temp">Temperature sweep</option><option value="volt">Voltage sweep</option><option value="corners">PVT corners</option></select></div>
          <div id="cond-rows" class="stack" style="gap:8px">${ui.conds.map(([l, s], i) => `<div class="cond-row"><input type="text" aria-label="Condition label" data-ci="${i}" data-k="0" value="${esc(l)}"><input type="number" aria-label="Noise scale" step="0.1" min="0" data-ci="${i}" data-k="1" value="${s}"><button type="button" class="btn icon small ghost" data-del-cond="${i}" aria-label="Remove condition">${ICONS.x}</button></div>`).join('')}</div>
          <div class="row"><button type="button" class="btn small" id="add-cond">${ICONS.plus} Condition</button><span class="small muted">Noise σ is multiplied by the scale. The first read of the first condition is the enrolment.</span></div>
        </div>
        <div class="row"><button class="btn primary" type="submit">${ICONS.play} Generate & analyse</button></div>
      </form>
    </section>
    <section class="card" aria-labelledby="imp-t">
      <div class="card-head"><div><h2 id="imp-t">Import measurements</h2><p class="card-sub">CSV / TXT / JSON / NumPy .npy · binary or hex · processed locally</p></div></div>
      <div class="stack">
        <label class="dropzone" id="drop" tabindex="0">${ICONS.upload}<div><b>Drop a file here</b> or click to browse</div><div class="small muted">.csv, .txt, .json (Python export), .npy (devices × [measurements ×] bits)</div><input type="file" id="file" accept=".csv,.txt,.tsv,.json,.npy" hidden></label>
        <label class="field"><span>…or paste data</span><textarea id="paste" spellcheck="false" placeholder="device,measurement,condition,response&#10;chipA,0,25C,0x3fa9c2...&#10;chipA,1,85C,0x3fa9c0...&#10;chipB,0,25C,0x91be07..."></textarea></label>
        <div class="form-grid">
          <label class="field"><span>Name</span><input type="text" id="imp-name" placeholder="My SRAM PUF batch"></label>
          <label class="field"><span>Encoding</span><select id="imp-fmt"><option value="auto">Auto-detect</option><option value="bin">Binary</option><option value="hex">Hexadecimal</option></select></label>
        </div>
        <div class="row"><button class="btn primary" id="imp-go">${ICONS.upload} Import & analyse</button><button class="btn ghost small" id="imp-example">Load example text</button></div>
        <details class="small muted"><summary style="cursor:pointer;font-weight:800">Accepted layouts</summary>
          <ul><li>One response per line → one device each (inter-device metrics only).</li><li><code>device,response</code> — repeated rows of the same device are re-measurements.</li><li><code>device,measurement,response</code> or <code>device,measurement,condition,response</code>.</li><li>Any of these with a header row (<code>device, measurement, condition, response</code>).</li><li>Lines starting with <code>#</code> are comments; separators: comma, semicolon, tab or space.</li></ul></details>
      </div>
    </section>
    <section class="card span-all" aria-labelledby="dsl-t">
      <div class="card-head"><div><h2 id="dsl-t">Session datasets</h2><p class="card-sub">Stored in this browser (IndexedDB). Click to make active.</p></div></div>
      <div class="ds-list">${ctx.state.entries.length ? ctx.state.entries.map((en) => { const s = datasetSummary(en.ds); return `<div class="ds-item ${en.id === ctx.state.activeId ? 'active' : ''}">
        <div class="ds-info"><div class="ds-name">${esc(en.ds.name)}</div><div class="small muted">${s.devices} dev × ${s.minMeas === s.maxMeas ? s.minMeas : `${s.minMeas}–${s.maxMeas}`} meas × ${s.bits} bits · ${s.conditions.length} cond${s.hasChallenges ? ' · CRPs' : ''}${en.ds.metadata?.simulator ? ` · sim ${en.ds.metadata.simulator} seed ${en.ds.metadata.seed}` : ''}</div></div>
        <div class="btn-group">${en.id === ctx.state.activeId ? '<span class="chip accent">active</span>' : `<button class="btn small" data-activate="${en.id}">Activate</button>`}
          <button class="btn small ghost" data-rename="${en.id}">Rename</button><button class="btn small ghost" data-exp="${en.id}" data-f="csv">CSV</button><button class="btn small ghost" data-exp="${en.id}" data-f="json">JSON</button><button class="btn small ghost danger" data-remove="${en.id}" aria-label="Delete dataset">${ICONS.trash}</button></div></div>`; }).join('') : '<p class="muted">No datasets yet.</p>'}</div>
    </section>
    ${e ? `<section class="card span-all" aria-labelledby="tools-t">
      <div class="card-head"><div><h2 id="tools-t">Pre-processing tools</h2><p class="card-sub">Each tool creates a new derived dataset; the original stays untouched.</p></div></div>
      <div class="grid grid-3">
        <div class="inset stack"><b>Bit window</b><div class="form-grid"><label class="field"><span>From bit</span><input type="number" id="t-from" value="0" min="0"></label><label class="field"><span>To bit (excl.)</span><input type="number" id="t-to" value="${e.ds.nBits}" min="1"></label></div><button class="btn small" id="t-window">Extract window</button></div>
        <div class="inset stack"><b>Dark-bit masking</b><label class="field"><span>Max flip rate</span><input type="number" id="t-thr" value="0.05" step="0.01" min="0" max="0.5"><small>Drops bit positions whose population flip rate exceeds this value.</small></label><button class="btn small" id="t-mask" ${e.result?.ber ? '' : 'disabled'}>Mask unstable bits</button></div>
        <div class="inset stack"><b>Device subset</b><label class="field"><span>Keep first N devices</span><input type="number" id="t-ndev" value="${Math.max(2, Math.floor(e.ds.devices.length / 2))}" min="2" max="${e.ds.devices.length}"></label><button class="btn small" id="t-subset">Create subset</button></div>
      </div>
    </section>
    <section class="card span-all" aria-labelledby="bm-t">
      <div class="card-head"><div style="flex:1"><h2 id="bm-t">Response explorer</h2><p class="card-sub">Raw bits per device, the majority-vote golden response, or per-cell stability</p></div>
        <div class="seg" role="group" aria-label="Bitmap mode">${[['first', 'Enrolment'], ['majority', 'Majority vote'], ['stability', 'Stability map']].map(([k, l]) => `<button data-bm="${k}" aria-pressed="${(ctx.state.ui.bm || 'first') === k}">${l}</button>`).join('')}</div>
        <div class="chart-tools"><button class="btn small ghost" data-act="csv" data-chart="data-bitmap">CSV</button><button class="btn small ghost" data-act="svg" data-chart="data-bitmap">SVG</button><button class="btn small ghost" data-act="png" data-chart="data-bitmap">PNG</button></div></div>
      <div class="chart" id="data-bitmap"></div>
    </section>` : ''}
  </div>`;
  bindChartTools(root, ctx);
  if (e) bitmap($('#data-bitmap'), e.ds, ctx.state.ui.bm || 'first');
  $$('[data-bm]').forEach((b) => (b.onclick = () => { ctx.state.ui.bm = b.dataset.bm; $$('[data-bm]').forEach((x) => x.setAttribute('aria-pressed', x === b)); bitmap($('#data-bitmap'), e.ds, b.dataset.bm); }));

  // simulation form
  $$('[data-model]').forEach((b) => (b.onclick = () => { ui.model = b.dataset.model; dataView(ctx, root); }));
  $('#reseed').onclick = () => { $('[name=seed]').value = Math.floor(Math.random() * 1e6); };
  const syncConds = () => $$('#cond-rows [data-ci]').forEach((inp) => { ui.conds[+inp.dataset.ci][+inp.dataset.k] = inp.dataset.k === '1' ? +inp.value : inp.value; });
  $('#add-cond').onclick = () => { syncConds(); ui.conds.push([`cond${ui.conds.length + 1}`, 1]); dataView(ctx, root); };
  $$('[data-del-cond]').forEach((b) => (b.onclick = () => { syncConds(); if (ui.conds.length > 1) ui.conds.splice(+b.dataset.delCond, 1); dataView(ctx, root); }));
  $('#cond-preset').onchange = (ev) => { if (COND_PRESETS[ev.target.value]) { ui.conds = COND_PRESETS[ev.target.value].map((x) => x.slice()); dataView(ctx, root); } };
  $('#sim-form').onsubmit = async (ev) => {
    ev.preventDefault(); syncConds();
    const f = new FormData(ev.target), params = {};
    for (const [k, , , step] of MODEL_PARAMS[ui.model]) { const v = f.get(`p_${k}`); params[k] = step === null ? v : Number(v); }
    for (const k of ['stages', 'xor', 'loops', 'x', 'y']) if (k in params) params[k] = Math.max(k === 'loops' ? 0 : 1, params[k] | 0);
    const spec = { model: ui.model, n_devices: +f.get('n_devices'), n_bits: +f.get('n_bits'), n_repeats: +f.get('n_repeats'), seed: +f.get('seed'), conditions: ui.conds.map(([l, s]) => [String(l).trim() || 'cond', Number(s)]), params };
    if (spec.n_devices * spec.n_bits * spec.n_repeats * spec.conditions.length > 4e7) return toast('That population is very large; please reduce devices × bits × measurements.', 'error');
    const btn = ev.submitter; if (btn) btn.disabled = true;
    try { const ds = await ctx.runTask('simulate', spec); await ctx.addDataset(ds, { go: 'overview' }); } catch (err) { toast(err.message, 'error'); } finally { if (btn) btn.disabled = false; }
  };

  // import
  const drop = $('#drop'), file = $('#file');
  drop.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); file.click(); } };
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', (ev) => ev.dataTransfer.files[0] && importFile(ctx, ev.dataTransfer.files[0]));
  file.onchange = () => file.files[0] && importFile(ctx, file.files[0]);
  $('#imp-example').onclick = () => { $('#paste').value = EXAMPLE_TEXT; $('#imp-name').value = 'Example SRAM readouts'; };
  $('#imp-go').onclick = async () => {
    const txt = $('#paste').value.trim(); if (!txt) return toast('Paste some data or choose a file first', 'error');
    try { const ds = parseText(txt, $('#imp-fmt').value, $('#imp-name').value.trim() || 'Imported dataset'); await ctx.addDataset(ds, { go: 'overview' }); } catch (err) { toast(err.message, 'error'); }
  };

  // dataset list
  root.querySelectorAll('[data-activate]').forEach((b) => (b.onclick = () => ctx.setActive(b.dataset.activate)));
  root.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = () => { const en = ctx.state.entries.find((x) => x.id === b.dataset.remove); if (confirm(`Delete “${en.ds.name}” from this browser?`)) ctx.removeEntry(b.dataset.remove); }));
  root.querySelectorAll('[data-rename]').forEach((b) => (b.onclick = () => { const en = ctx.state.entries.find((x) => x.id === b.dataset.rename); const n = prompt('Dataset name', en.ds.name); if (n && n.trim()) ctx.renameEntry(en.id, n.trim()); }));
  root.querySelectorAll('[data-exp]').forEach((b) => (b.onclick = () => { const en = ctx.state.entries.find((x) => x.id === b.dataset.exp); if (b.dataset.f === 'csv') download(`${slug(en.ds.name)}.csv`, toCSV(en.ds), 'text/csv'); else download(`${slug(en.ds.name)}.json`, JSON.stringify(toDict(en.ds)), 'application/json'); }));

  // tools
  if (e) {
    const derive = (name, responses, extra = {}) => ctx.addDataset(makeDataset(responses, { deviceIds: e.ds.deviceIds, conditions: e.ds.conditions, name, metadata: { derived_from: e.ds.name, ...extra } }), { go: 'overview' });
    const sliceBits = (keep) => e.ds.devices.map((_, d) => idx(e.ds.nMeas[d]).map((m) => { const r = measurement(e.ds, d, m); return Uint8Array.from(keep, (i) => r[i]); }));
    $('#t-window').onclick = () => { const a = Math.max(0, +$('#t-from').value), b = Math.min(e.ds.nBits, +$('#t-to').value); if (b - a < 8) return toast('Window must contain at least 8 bits', 'error'); derive(`${e.ds.name} [bits ${a}:${b}]`, sliceBits(idx(b - a).map((i) => i + a)), { window: [a, b] }); };
    $('#t-mask').onclick = () => { const thr = +$('#t-thr').value, fr = e.result.ber.per_bit, keep = idx(e.ds.nBits).filter((i) => fr[i] <= thr); if (keep.length < 8) return toast('Fewer than 8 bits would remain; raise the threshold', 'error'); toast(`Kept ${keep.length} of ${e.ds.nBits} bits`); derive(`${e.ds.name} [masked ≤${thr}]`, sliceBits(keep), { masked_threshold: thr, kept_bits: keep.length }); };
    $('#t-subset').onclick = () => { const n = Math.min(e.ds.devices.length, Math.max(2, +$('#t-ndev').value)); const sub = subsetDevices(e.ds, idx(n)); ctx.addDataset({ ...sub, name: `${e.ds.name} [${n} devices]`, metadata: { derived_from: e.ds.name } }, { go: 'overview' }); };
  }
}
const EXAMPLE_TEXT = `# device,measurement,condition,response  (hex-encoded 64-bit responses)
device,measurement,condition,response
chipA,0,25C,0xA3F1C29B7E4D0516
chipA,1,25C,0xA3F1C29B7E4D0516
chipA,2,85C,0xA3F1C2997E4D0716
chipB,0,25C,0x5C0E3D64819BF2E9
chipB,1,25C,0x5C0E3D64819BF2E9
chipB,2,85C,0x5C0E3D64819BF2A9
chipC,0,25C,0x9E77A1B0C3582D4F
chipC,1,25C,0x9E77A1B0C3582D4E
chipC,2,85C,0x9E77A1B4C3582D4F
chipD,0,25C,0x16D8F02B5A9C47E3
chipD,1,25C,0x16D8F02B5A9C47E3
chipD,2,85C,0x16D8F02B5A9D47E3`;

async function importFile(ctx, f) {
  try {
    let ds; const base = f.name.replace(/\.[^.]+$/, '');
    if (f.name.endsWith('.npy')) ds = makeDataset(parseNpy(await f.arrayBuffer()), { name: base });
    else if (f.name.endsWith('.json')) { ds = fromDict(JSON.parse(await f.text())); if (!ds.name || ds.name === 'dataset') ds.name = base; }
    else ds = parseText(await f.text(), $('#imp-fmt')?.value || 'auto', base);
    await ctx.addDataset(ds, { go: 'overview' });
  } catch (err) { toast(`Import failed: ${err.message}`, 'error'); }
}

// ================================================================= METRICS
function metricsView(ctx, root) {
  const e = needData(ctx, root, 'quality metrics'); if (!e) return;
  const r = e.result, st = ctx.state.settings, ci = r.confidence_intervals || {};
  const row = (name, key, v, ideal, unit = '%', def = '', ciKey = key) => `<tr><td><b>${name}</b><div class="small muted">${def}</div></td><td class="num">${fmt(v, unit === '' ? 4 : 2)}${unit}</td><td class="num">${ideal}</td><td class="num">${ci[ciKey] ? `${fmt(ci[ciKey].low)} – ${fmt(ci[ciKey].high)}` : '–'}</td><td>${statusBadge(status(key, key === 'ber' ? v : v))}</td></tr>`;
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <section class="card" aria-labelledby="set-t">
      <div class="card-head"><div><h2 id="set-t">Analysis settings</h2><p class="card-sub">Applies to all views; recorded in reports and the reproduction script.</p></div></div>
      <form id="settings" class="row" style="align-items:flex-end;gap:16px">
        <div class="field"><span>Enrolment reference</span><div class="seg" role="group" aria-label="Reference">${[['first', 'First read'], ['majority', 'Majority vote']].map(([k, l]) => `<button type="button" data-ref="${k}" aria-pressed="${st.reference === k}">${l}</button>`).join('')}</div></div>
        <label class="field" style="width:130px"><span>Bootstrap B</span><input type="number" name="bootstrap" min="0" max="20000" step="100" value="${st.bootstrap}"></label>
        <label class="field" style="width:120px"><span>CI level</span><select name="alpha">${[0.1, 0.05, 0.01].map((a) => `<option value="${a}" ${st.alpha === a ? 'selected' : ''}>${Math.round((1 - a) * 100)}%</option>`).join('')}</select></label>
        <label class="field" style="width:120px"><span>NIST α</span><select name="nistAlpha">${[0.01, 0.05, 0.001].map((a) => `<option value="${a}" ${st.nistAlpha === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label class="field" style="width:130px"><span>Bootstrap seed</span><input type="number" name="seed" value="${st.seed}"></label>
        <button class="btn primary" type="submit">Recompute</button>
      </form>
    </section>
    <section class="card" aria-labelledby="mt-t">
      <div class="card-head"><div><h2 id="mt-t">Metric summary</h2><p class="card-sub">${r.confidence_intervals ? `${Math.round(r.confidence_intervals.level * 100)}% percentile-bootstrap CIs over devices (B = ${r.confidence_intervals.resamples})` : 'Confidence intervals need ≥ 3 devices'}</p></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Metric</th><th class="num">Value</th><th class="num">Ideal</th><th class="num">CI</th><th>Assessment</th></tr></thead><tbody>
        ${row('Uniformity', 'uniformity', r.uniformity.mean, '50%', '%', 'Fraction of 1s per response')}
        ${row('Bit-aliasing', 'bit_aliasing', r.bit_aliasing.mean, '50%', '%', `Per-bit 1-probability across devices · σ = ${fmt(r.bit_aliasing.std)}%`)}
        ${r.uniqueness ? row('Uniqueness', 'uniqueness', r.uniqueness.mean, '50%', '%', `Mean inter-device fHD over ${r.uniqueness.pairs} pairs · σ = ${fmt(r.uniqueness.std)}%`) : ''}
        ${r.reliability ? row('Reliability', 'reliability', r.reliability.mean, '100%', '%', '100 − mean intra-device fHD') : ''}
        ${r.steadiness ? row('Steadiness', 'reliability', r.steadiness.mean, '100%', '%', '1 + mean log₂ max(pₗ, 1−pₗ)', null) : ''}
        ${r.ber ? row('Mean bit error rate', 'ber', r.ber.mean, '0', '', `Worst device read: ${fmt(r.ber.max, 4)}`) : ''}
        ${r.stable_bits !== undefined ? `<tr><td><b>Stable-bit ratio</b><div class="small muted">Cells that never flipped</div></td><td class="num">${fmt(r.stable_bits * 100, 2)}%</td><td class="num">100%</td><td class="num">–</td><td>${statusBadge(r.stable_bits > 0.9 ? 'good' : r.stable_bits > 0.7 ? 'fair' : 'poor')}</td></tr>` : ''}
      </tbody></table></div>
    </section>
    <div class="grid grid-2">
      ${chartCard('m-unif', 'Uniformity per device', 'Ideal 50%')}
      ${r.reliability ? chartCard('m-rel', 'Reliability per device', 'Higher is better') : chartCard('m-hw', 'Hamming-weight distribution', 'Enrolled responses')}
      ${chartCard('m-ba', 'Bit-aliasing per bit position', 'Bias of each bit across the population', 'span-all')}
      ${r.ber ? chartCard('m-fr', 'Error rate per bit position', 'Probability that a bit differs from the enrolment read', 'span-all') : ''}
      ${r.conditions && Object.keys(r.conditions).length ? chartCard('m-cond', 'Bit error rate by operating condition', 'Mean fHD to the enrolment read') : ''}
      ${r.reliability ? chartCard('m-hw', 'Hamming-weight distribution', 'Enrolled responses') : ''}
    </div>
  </div>`;
  bindChartTools(root, ctx);
  const D = r.meta.devices, N = r.meta.bits;
  plot($('#m-unif'), { x: { label: 'Device index' }, y: { label: 'Uniformity (%)', domain: [0, 100] }, layers: [{ type: 'bar', x: idx(D), y: r.uniformity.per_device, name: 'Uniformity' }, { type: 'hline', y: 50, label: 'ideal 50%' }] });
  if (r.reliability) plot($('#m-rel'), { x: { label: 'Device index' }, y: { label: 'Reliability (%)', domain: [Math.min(90, Math.floor(r.reliability.min - 1)), 100] }, layers: [{ type: 'bar', x: idx(D), y: r.reliability.per_device, name: 'Reliability', slot: 2 }] });
  plot($('#m-ba'), { x: { label: 'Bit position' }, y: { label: 'P(bit = 1) (%)', domain: [0, 100] }, layers: [{ type: 'bar', x: idx(N), y: r.bit_aliasing.per_bit, name: 'Bit-aliasing' }, { type: 'hline', y: 50, label: 'ideal 50%' }] });
  if (r.ber) plot($('#m-fr'), { x: { label: 'Bit position' }, y: { label: 'Bit error rate' }, layers: [{ type: 'bar', x: idx(N), y: r.ber.per_bit, name: 'Error rate', slot: 1 }, { type: 'hline', y: r.ber.mean, label: `mean ${fmt(r.ber.mean, 4)}` }] });
  if ($('#m-cond')) { const ks = Object.keys(r.conditions); plot($('#m-cond'), { x: { label: 'Condition', ticks: idx(ks.length), format: (v) => esc(ks[Math.round(v)] ?? ''), tipFormat: (v) => esc(ks[v]) }, y: { label: 'Bit error rate' }, layers: [{ type: 'bar', x: idx(ks.length), y: ks.map((k) => r.conditions[k].ber), name: 'BER', slot: 6, barFrac: 0.55 }] }); }
  const hw = r.hamming_weight.histogram, nz = hw.map((v, i) => [i, v]).filter(([, v]) => v);
  const lo = Math.max(0, (nz[0]?.[0] ?? 0) - 3), hi = Math.min(N, (nz.at(-1)?.[0] ?? N) + 3);
  plot($('#m-hw'), { x: { label: 'Hamming weight' }, y: { label: 'Devices', integer: true }, layers: [{ type: 'bar', x: idx(hi - lo + 1).map((i) => i + lo), y: hw.slice(lo, hi + 1), name: 'Devices', slot: 2 }, { type: 'vline', x: N / 2, label: 'N/2' }] });

  $$('[data-ref]').forEach((b) => (b.onclick = () => $$('[data-ref]').forEach((x) => x.setAttribute('aria-pressed', x === b))));
  $('#settings').onsubmit = (ev) => {
    ev.preventDefault(); const f = new FormData(ev.target);
    ctx.applySettings({ reference: $('[data-ref][aria-pressed=true]').dataset.ref, bootstrap: Math.max(0, +f.get('bootstrap') | 0), alpha: +f.get('alpha'), nistAlpha: +f.get('nistAlpha'), seed: +f.get('seed') | 0 });
  };
}

// ================================================================= IDENTIFICATION
function identifyView(ctx, root) {
  const e = needData(ctx, root, 'identification analysis'); if (!e) return;
  const r = e.result;
  if (!r.identification) { root.innerHTML = `<div class="card empty"><h2>Identification needs repeated measurements</h2><p class="muted">Import or simulate at least two reads per device and two or more devices.</p><a class="btn primary" href="#/data">Go to data</a></div>`; return; }
  const I = r.identification, N = r.meta.bits, ui = ctx.state.ui;
  if (ui.thr === undefined || ui.thr > N) ui.thr = I.binomial.threshold;
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <div class="tiles">
      <div class="tile"><div class="t-label">Decidability d'</div><div class="t-value">${fmt(I.decidability)}</div>${statusBadge(status('decidability', I.decidability))}</div>
      <div class="tile"><div class="t-label">Empirical EER</div><div class="t-value">${fmt(I.eer, 4)}</div><span class="small muted">at t = ${I.eer_threshold}</span></div>
      <div class="tile"><div class="t-label">Binomial threshold t*</div><div class="t-value">${I.binomial.threshold} <small class="muted">bits</small></div><span class="small muted">${fmt((I.binomial.threshold / N) * 100, 1)}% of N</span></div>
      <div class="tile"><div class="t-label">FAR(t*) model</div><div class="t-value">${fmtNum(I.binomial.far)}</div><span class="small muted">p_inter = ${fmt(I.binomial.p_inter, 4)}</span></div>
      <div class="tile"><div class="t-label">FRR(t*) model</div><div class="t-value">${fmtNum(I.binomial.frr)}</div><span class="small muted">p_intra = ${fmt(I.binomial.p_intra, 4)}</span></div>
    </div>
    ${chartCard('id-hd', 'Intra- vs inter-device distance distributions', `Bars: empirical · dashed: binomial fits (χ² p = ${fmt(r.intra_hd.fit.p_value, 3)} intra, ${fmt(r.inter_hd.fit.p_value, 3)} inter)`, '', `<div class="seg" role="group" aria-label="Scale"><button data-ylog="0" aria-pressed="${!ui.hdlog}">Linear</button><button data-ylog="1" aria-pressed="${!!ui.hdlog}">Log</button></div>`)}
    <section class="card" aria-labelledby="thr-t">
      <div class="card-head"><div><h3 id="thr-t">Acceptance threshold explorer</h3><p class="card-sub">Accept a response when HD ≤ t. Empirical rates are limited by sample size; the binomial model extrapolates to rare events.</p></div></div>
      <div class="row" style="gap:18px"><label class="field" style="flex:1;min-width:220px"><span>Threshold t = <b id="thr-v">${ui.thr}</b> bits (${fmt((ui.thr / N) * 100, 1)}%)</span><input type="range" id="thr" min="0" max="${N}" value="${ui.thr}"></label>
        <div class="tiles" style="flex:2;min-width:260px" id="thr-tiles"></div></div>
      <div class="chart" id="id-roc" style="margin-top:12px"></div>
    </section>
    <div class="grid grid-2">
      ${chartCard('id-mat', 'Inter-device distance matrix', 'Pairwise fractional HD of enrolled responses')}
      ${chartCard('id-det', 'DET-style trade-off', 'FRR vs FAR on log axes (binomial model)')}
    </div>
  </div>`;
  bindChartTools(root, ctx);
  hdChart($('#id-hd'), r, !!ui.hdlog);
  $$('[data-ylog]').forEach((b) => (b.onclick = () => { ui.hdlog = b.dataset.ylog === '1'; $$('[data-ylog]').forEach((x) => x.setAttribute('aria-pressed', x === b)); hdChart($('#id-hd'), r, ui.hdlog); }));
  const t = idx(N + 1), best = Math.min(...t.map((k) => Math.max(I.binomial.far_curve[k], I.binomial.frr_curve[k]))), floor = Math.min(1e-6, Math.max(1e-120, best / 1e3)), cap = (a) => a.map((v) => (v > floor ? v : null));
  const drawRoc = () => {
    plot($('#id-roc'), { height: 300, x: { label: 'Threshold t (bits)' }, y: { label: 'Error rate', type: 'log', domain: [floor, 1] }, layers: [
      { type: 'line', x: t, y: cap(I.far), name: 'FAR (empirical)', slot: 1 }, { type: 'line', x: t, y: cap(I.frr), name: 'FRR (empirical)', slot: 0 },
      { type: 'line', x: t, y: cap(I.binomial.far_curve), name: 'FAR (binomial)', slot: 1, dash: '5 4' }, { type: 'line', x: t, y: cap(I.binomial.frr_curve), name: 'FRR (binomial)', slot: 0, dash: '5 4' },
      { type: 'vline', x: ui.thr, label: `t = ${ui.thr}` }], ariaLabel: 'FAR and FRR versus threshold' });
    $('#id-roc')._csv = () => ['t,far_emp,frr_emp,far_binom,frr_binom', ...t.map((k) => [k, I.far[k], I.frr[k], I.binomial.far_curve[k], I.binomial.frr_curve[k]].join(','))].join('\n');
    const k = ui.thr;
    $('#thr-tiles').innerHTML = [['FAR empirical', I.far[k]], ['FRR empirical', I.frr[k]], ['FAR binomial', I.binomial.far_curve[k]], ['FRR binomial', I.binomial.frr_curve[k]]].map(([l, v]) => `<div class="tile"><div class="t-label">${l}</div><div class="t-value">${fmtNum(v)}</div></div>`).join('');
  };
  drawRoc();
  $('#thr').oninput = (ev) => { ui.thr = +ev.target.value; $('#thr-v').textContent = ui.thr; drawRoc(); };
  const M = r.inter_hd_matrix, D = M.length;
  heatmap($('#id-mat'), { rows: D, cols: D, value: (a, b) => (a === b ? null : M[a][b]), domain: [Math.min(0.3, ...M.flat().filter((v, i) => i % (D + 1))), Math.max(0.7, ...M.flat())], scale: 'sequential', square: D <= 64, xLabel: 'Device', yLabel: 'Device', legendLabel: 'fHD', tip: (a, b, v) => `<div class="tip-head">${esc(e.ds.deviceIds[a])} ↔ ${esc(e.ds.deviceIds[b])}</div>fHD <b>${fmtNum(v, 4)}</b>`, ariaLabel: 'Inter-device distance matrix' });
  plot($('#id-det'), { x: { label: 'FAR', type: 'log', domain: [floor, 1] }, y: { label: 'FRR', type: 'log', domain: [floor, 1] }, layers: [{ type: 'line', x: I.binomial.far_curve.map((v) => Math.max(v, floor)), y: I.binomial.frr_curve.map((v) => (v > floor ? v : null)), name: 'Binomial model', markers: false, slot: 6 }], hover: true });
}

// ================================================================= RANDOMNESS
function randomnessView(ctx, root) {
  const e = needData(ctx, root, 'randomness tests'); if (!e) return;
  const r = e.result, nist = r.nist, en = r.entropy, applicable = nist.tests.filter((t) => t.applicable), passed = applicable.filter((t) => t.passed).length;
  const D = r.meta.devices, N = r.meta.bits;
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <div class="tiles">
      <div class="tile"><div class="t-label">Shannon / bit (population)</div><div class="t-value">${fmt(en.shannon_mean, 4)}</div></div>
      <div class="tile"><div class="t-label">Min-entropy / bit</div><div class="t-value">${fmt(en.min_entropy_mean, 4)}</div>${statusBadge(status('entropy', en.min_entropy_mean))}</div>
      <div class="tile"><div class="t-label">SP 800-90B MCV</div><div class="t-value">${fmt(en.mcv_min_entropy, 4)}</div></div>
      <div class="tile"><div class="t-label">SP 800-90B Markov</div><div class="t-value">${fmt(en.markov_min_entropy, 4)}</div></div>
      <div class="tile"><div class="t-label">LZ76 complexity</div><div class="t-value">${fmt(en.lz_complexity, 4)}</div></div>
      <div class="tile"><div class="t-label">Mean |bit corr.|</div><div class="t-value">${fmt(r.correlation.mean_abs, 4)}</div><span class="small muted">max ${fmt(r.correlation.max_abs, 3)}</span></div>
    </div>
    <section class="card" aria-labelledby="nist-t">
      <div class="card-head"><div><h2 id="nist-t">NIST SP 800-22 statistical tests</h2><p class="card-sub">Concatenated enrolled responses, n = ${nist.n} bits, α = ${nist.alpha} · ${passed}/${applicable.length} applicable tests passed</p></div>${statusBadge(applicable.length ? (passed === applicable.length ? 'good' : passed >= applicable.length - 1 ? 'fair' : 'poor') : 'na', `${passed}/${applicable.length} pass`)}</div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Test</th><th class="num">p-value</th><th style="width:30%">p-value scale</th><th>Parameters</th><th>Result</th></tr></thead><tbody>
      ${nist.tests.map((t) => `<tr><td><b>${t.name}</b></td><td class="num">${t.applicable ? (t.p_values.length > 1 ? t.p_values.map((p) => fmt(p, 4)).join(' / ') : fmt(t.p_value, 4)) : '–'}</td>
        <td>${t.applicable ? `<div class="pbar" title="p = ${fmt(t.p_value, 4)}"><span style="width:${Math.max(2, t.p_value * 100)}%;background:var(--status-${t.passed ? 'good' : 'poor'})"></span></div>` : ''}</td>
        <td class="small muted">${esc(t.note || '')}</td><td>${t.applicable ? statusBadge(t.passed ? 'good' : 'poor', t.passed ? 'Pass' : 'Fail') : statusBadge('na', 'Not applicable')}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small muted" style="margin:12px 0 0">Tests whose minimum length is not met are reported as not applicable rather than producing unreliable p-values. Simulate or import more bits (≥ 1000 for all eight tests).</p>
    </section>
    <div class="grid grid-2">
      ${chartCard('r-ent', 'Entropy per bit position', 'Across the device population (ideal 1 bit)', 'span-all')}
      ${chartCard('r-corr', 'Bit-position correlation', `Pearson φ across devices, first ${r.correlation.matrix.length} bits`)}
      ${chartCard('r-ac', 'Autocorrelation of responses', 'Mean over devices; band = 95% white-noise interval')}
    </div>
  </div>`;
  bindChartTools(root, ctx);
  plot($('#r-ent'), { x: { label: 'Bit position' }, y: { label: 'Entropy (bits)', domain: [0, 1.05] }, layers: [{ type: 'line', x: idx(N), y: en.shannon_per_bit, name: 'Shannon' }, { type: 'line', x: idx(N), y: en.min_entropy_per_bit, name: 'Min-entropy', slot: 1 }] });
  const C = r.correlation.matrix, B = C.length;
  heatmap($('#r-corr'), { rows: B, cols: B, value: (a, b) => C[a][b], domain: [-1, 1], scale: 'diverging', square: true, xLabel: 'Bit', yLabel: 'Bit', legendLabel: 'φ', tip: (a, b, v) => `<div class="tip-head">bits ${a} × ${b}</div>φ = <b>${fmtNum(v, 3)}</b>`, ariaLabel: 'Bit correlation matrix' });
  const ac = r.correlation.autocorrelation, lags = idx(ac.length).map((i) => i + 1), band = lags.map((l) => 1.96 / Math.sqrt(D * (N - l)));
  plot($('#r-ac'), { x: { label: 'Lag (bits)' }, y: { label: 'Autocorrelation' }, layers: [{ type: 'band', x: lags, y0: band.map((v) => -v), y1: band, slot: 0, opacity: 0.18 }, { type: 'bar', x: lags, y: ac, name: 'Autocorrelation', slot: 6 }] });
}

// ================================================================= ATTACK LAB
function attackView(ctx, root) {
  const ui = ctx.state.ui.atk || (ctx.state.ui.atk = { model: 'arbiter', stages: 64, xors: '1,2,3,4', noise: 0.05, sizes: '50,100,200,500,1000,2000,5000,10000', test: 2000, seed: 7, res: null, crp: null, land: null });
  const VAR = { arbiter: ['XOR values', 'XOR', 'comma separated, e.g. 1,2,4'], ff_arbiter: ['Feed-forward loop counts', 'loops', 'e.g. 0,1,2,3 (0 = plain arbiter)'], interpose: ['Lower-layer XOR y (x = 1)', 'y', 'e.g. 1,2,3'] }[ui.model];
  const e = ctx.active(), canCrp = e && e.ds.challenges;
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <section class="card" aria-labelledby="atk-t">
      <div class="card-head"><div><h2 id="atk-t">Modelling-attack learning curves</h2><p class="card-sub">Logistic regression on the parity feature vector φ(c) of the additive delay model. Each XOR value is a separate PUF instance.</p></div></div>
      <form id="atk-form" class="stack">
        <div class="seg" role="group" aria-label="Attacked PUF">${[['arbiter', 'Arbiter / XOR'], ['ff_arbiter', 'Feed-forward'], ['interpose', 'Interpose (1,y)']].map(([k, l]) => `<button type="button" data-amodel="${k}" aria-pressed="${ui.model === k}">${l}</button>`).join('')}</div>
        <div class="form-grid">
          <label class="field"><span>Stages k</span><input type="number" name="stages" min="4" max="256" value="${ui.stages}"></label>
          <label class="field"><span>${VAR[0]}</span><input type="text" name="xors" value="${esc(ui.xors)}"><small>${VAR[2]}</small></label>
          <label class="field"><span>Noise σ</span><input type="number" name="noise" step="0.01" min="0" value="${ui.noise}"></label>
          <label class="field"><span>Training CRPs</span><input type="text" name="sizes" value="${esc(ui.sizes)}"></label>
          <label class="field"><span>Test CRPs</span><input type="number" name="test" min="100" value="${ui.test}"></label>
          <label class="field"><span>Seed</span><input type="number" name="seed" value="${ui.seed}"></label>
        </div>
        <div class="row"><button class="btn primary" type="submit">${ICONS.play} Run attack</button><button class="btn" type="button" id="atk-land">${ICONS.metrics} 3D learnability landscape</button><span class="small muted">Runs in a background thread; large k × CRP counts may take a few seconds.</span></div>
      </form>
    </section>
    ${ui.land ? `<section class="card"><div class="card-head"><div style="flex:1;min-width:180px"><h3>Learnability landscape · ${esc(ui.land.title)}</h3><p class="card-sub">Test accuracy over stages × training CRPs (drag to rotate)</p></div><div class="chart-tools no-print"><button class="btn small ghost" data-act="csv" data-chart="atk-land3d">CSV</button><button class="btn small ghost" data-act="svg" data-chart="atk-land3d">SVG</button><button class="btn small ghost" data-act="png" data-chart="atk-land3d">PNG</button></div></div><div class="chart" id="atk-land3d"></div></section>` : ''}
    ${chartCard('atk-curve', 'Prediction accuracy vs training set size', 'Held-out test accuracy; 50% = random guessing')}
    ${ui.res ? `<section class="card"><h3>Results</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>PUF</th>${ui.res[0].train_sizes.map((n) => `<th class="num">${n}</th>`).join('')}</tr></thead><tbody>${ui.res.map((r) => `<tr><td><b>${esc(r.label || `${r.xor}-XOR`)}, k=${r.stages}</b></td>${r.test_accuracy.map((a) => `<td class="num">${fmt(a * 100, 1)}%</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : ''}
    <section class="card" aria-labelledby="crp-t">
      <div class="card-head"><div><h2 id="crp-t">Attack your own CRPs</h2><p class="card-sub">Paste <code>challenge,response</code> lines (binary challenge of k bits, response 0/1) or use the active simulated Arbiter dataset.</p></div></div>
      <div class="stack">
        <textarea id="crp-text" spellcheck="false" placeholder="0110100101...,1&#10;1110001011...,0"></textarea>
        <div class="row">
          <label class="field" style="width:160px"><span>Test fraction</span><select id="crp-frac"><option value="0.2">20%</option><option value="0.3">30%</option><option value="0.5">50%</option></select></label>
          <button class="btn primary" id="crp-go">${ICONS.play} Attack pasted CRPs</button>
          ${canCrp ? `<button class="btn" id="crp-ds">Attack device 0 of “${esc(e.ds.name)}”</button>` : ''}
        </div>
        ${ui.crp ? `<div class="chart" id="crp-curve"></div>` : ''}
      </div>
    </section>
  </div>`;
  bindChartTools(root, ctx);
  const drawCurve = () => {
    if (!ui.res) { $('#atk-curve').innerHTML = '<p class="muted">Run an attack to see learning curves.</p>'; return; }
    plot($('#atk-curve'), { height: 300, x: { label: 'Training CRPs', type: 'log', format: (v) => (v >= 1000 ? `${v / 1000}k` : v) }, y: { label: 'Test accuracy (%)', domain: [40, 100] }, layers: [...ui.res.slice(0, 8).map((r, i) => ({ type: 'line', x: r.train_sizes, y: r.test_accuracy.map((a) => a * 100), name: r.label || `${r.xor}-XOR`, slot: i, markers: true })), { type: 'hline', y: 50, label: 'random guess' }] });
  };
  drawCurve();
  if (ui.crp) plot($('#crp-curve'), { height: 260, x: { label: 'Training CRPs', type: 'log' }, y: { label: 'Accuracy (%)', domain: [40, 100] }, layers: [{ type: 'line', x: ui.crp.train_sizes, y: ui.crp.test_accuracy.map((a) => a * 100), name: 'Test', markers: true }, { type: 'line', x: ui.crp.train_sizes, y: ui.crp.train_accuracy.map((a) => a * 100), name: 'Train', slot: 1, dash: '4 3', markers: true }, { type: 'hline', y: 50, label: 'random guess' }] });
  $('#atk-form').onsubmit = async (ev) => {
    ev.preventDefault(); const f = new FormData(ev.target);
    Object.assign(ui, { stages: +f.get('stages'), xors: f.get('xors'), noise: +f.get('noise'), sizes: f.get('sizes'), test: +f.get('test'), seed: +f.get('seed') });
    const xors = ui.xors.split(',').map((s) => parseInt(s, 10)).filter((v) => v >= (ui.model === 'ff_arbiter' ? 0 : 1)).slice(0, 8), sizes = ui.sizes.split(',').map((s) => parseInt(s, 10)).filter((v) => v >= 2).sort((a, b) => a - b);
    if (!xors.length || !sizes.length) return toast('Enter at least one XOR value and one training size', 'error');
    ev.submitter.disabled = true;
    try { ui.res = await ctx.runTask('attack', { model: ui.model, stages: ui.stages, xors, noise: ui.noise, train_sizes: sizes, test_size: ui.test, seed: ui.seed }); toast('Attack finished', 'success'); attackView(ctx, root); }
    catch (err) { toast(err.message, 'error'); ev.submitter.disabled = false; }
  };
  $$('[data-amodel]').forEach((b) => (b.onclick = () => { ui.model = b.dataset.amodel; ui.xors = { arbiter: '1,2,3,4', ff_arbiter: '0,1,2,3', interpose: '1,2,3' }[ui.model]; ui.res = null; ui.land = null; attackView(ctx, root); }));
  $('#atk-land').onclick = async (ev) => {
    const f = new FormData($('#atk-form')); const v = parseInt(String(f.get('xors')).split(',')[0], 10) || (ui.model === 'ff_arbiter' ? 0 : 1);
    ev.target.disabled = true;
    try {
      const res = await ctx.runTask('landscape', { model: ui.model, variant: v, stagesList: [8, 16, 24, 32, 48, 64], sizes: [50, 100, 200, 500, 1000, 2000, 4000], test_size: 1000, noise: +f.get('noise'), seed: +f.get('seed') });
      ui.land = { ...res, title: `${{ arbiter: `${v}-XOR Arbiter`, ff_arbiter: `FF Arbiter, ${v} loop(s)`, interpose: `(1,${v})-Interpose` }[ui.model]}` };
      attackView(ctx, root);
    } catch (err) { toast(err.message, 'error'); ev.target.disabled = false; }
  };
  if (ui.land) surface3d($('#atk-land3d'), { x: ui.land.sizes.map((n) => Math.log10(n)), y: ui.land.stagesList, z: ui.land.acc.map((r) => r.map((a) => a * 100)), xLabel: 'log₁₀ CRPs', yLabel: 'stages k', zLabel: 'accuracy %', zDomain: [40, 100], xFormat: (v) => `${Math.round(10 ** v)}`, tip: (i, j, v) => `<div class="tip-head">${ui.land.sizes[i]} CRPs · k = ${ui.land.stagesList[j]}</div>accuracy <b>${fmt(v, 1)}%</b>` });
  const runCrp = async (challenges, responses, n, k, frac) => {
    const test = Math.max(10, Math.floor(n * frac)), pool = n - test, sizes = [0.05, 0.1, 0.2, 0.4, 0.7, 1].map((q) => Math.max(10, Math.floor(pool * q)));
    ui.crp = await ctx.runTask('attack-crps', { challenges, responses, n, k, trainSizes: [...new Set(sizes)], testSize: test });
    toast(`Final test accuracy ${fmt(ui.crp.test_accuracy.at(-1) * 100, 1)}%`, 'success'); attackView(ctx, root);
  };
  $('#crp-go').onclick = async () => {
    try {
      const lines = $('#crp-text').value.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      const rows = lines.map((l) => l.split(/[,;\t\s]+/)).filter((c) => c.length >= 2 && /^[01]+$/.test(c[0]) && /^[01]$/.test(c[1]));
      if (rows.length < 50) throw new Error('Need at least 50 valid challenge,response lines');
      const k = rows[0][0].length; if (rows.some((r) => r[0].length !== k)) throw new Error('All challenges must have the same length');
      const ch = new Uint8Array(rows.length * k); rows.forEach((r, i) => { for (let j = 0; j < k; j++) ch[i * k + j] = r[0].charCodeAt(j) - 48; });
      await runCrp(ch, rows.map((r) => +r[1]), rows.length, k, +$('#crp-frac').value);
    } catch (err) { toast(err.message, 'error'); }
  };
  if ($('#crp-ds')) $('#crp-ds').onclick = () => runCrp(e.ds.challenges, Array.from(measurement(e.ds, 0, 0)), e.ds.nBits, e.ds.stages, +$('#crp-frac').value).catch((err) => toast(err.message, 'error'));
}

// ================================================================= KEY GENERATION
function keysView(ctx, root) {
  const e = ctx.active(), r = e?.result;
  const worst = r?.conditions ? Math.max(...Object.values(r.conditions).map((c) => c.ber)) : null;
  const ui = ctx.state.ui.keys || (ctx.state.ui.keys = {});
  if (ui.ber === undefined || ui.forId !== e?.id) {
    ui.forId = e?.id; ui.ber = +(worst ?? r?.ber?.mean ?? 0.05).toFixed(5); ui.h = +(Math.min(1, r?.entropy?.min_entropy_mean ?? 0.95)).toFixed(4);
    ui.key = ui.key || 128; ui.target = ui.target || 1e-6; ui.sel = null;
  }
  const plans = planKeyGeneration(ui.ber, ui.h, ui.key, ui.target).filter((p) => p.blocks !== null);
  const feasible = plans.filter((p) => p.feasible);
  const sel = ui.sel !== null ? plans.find((p) => `${p.code}|${p.repetition}` === ui.sel) : feasible[0];
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <section class="card" aria-labelledby="k-t">
      <div class="card-head"><div><h2 id="k-t">Fuzzy-extractor planner</h2><p class="card-sub">Code-offset construction with an inner repetition code and an outer block code. Assumes i.i.d. bit errors; helper data leaks n·r − k bits per block.</p></div></div>
      <form id="k-form" class="form-grid">
        <label class="field"><span>Bit error rate p</span><input type="number" name="ber" step="0.001" min="0.00001" max="0.45" value="${ui.ber}"><small>${r ? `dataset: mean ${fmt(r.ber?.mean, 4)}${worst !== null ? `, worst condition ${fmt(worst, 4)}` : ''}` : 'no dataset loaded'}</small></label>
        <label class="field"><span>Min-entropy / bit h</span><input type="number" name="h" step="0.01" min="0.01" max="1" value="${ui.h}"><small>${r ? `dataset: ${fmt(r.entropy.min_entropy_mean, 4)}` : ''}</small></label>
        <label class="field"><span>Key length</span><select name="key">${[64, 128, 192, 256].map((k) => `<option ${ui.key === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="field"><span>Target key failure</span><select name="target">${[1e-3, 1e-6, 1e-9, 1e-12].map((t) => `<option value="${t}" ${ui.target === t ? 'selected' : ''}>${t.toExponential(0)}</option>`).join('')}</select></label>
      </form>
    </section>
    <div class="tiles">
      <div class="tile"><div class="t-label">Feasible configurations</div><div class="t-value">${feasible.length} / ${plans.length}</div></div>
      <div class="tile"><div class="t-label">Most efficient</div><div class="t-value" style="font-size:1.05rem">${feasible[0] ? `${feasible[0].repetition > 1 ? `Rep(${feasible[0].repetition}) + ` : ''}${feasible[0].code}` : '–'}</div></div>
      <div class="tile"><div class="t-label">PUF bits needed</div><div class="t-value">${feasible[0] ? feasible[0].puf_bits.toLocaleString() : '–'}</div></div>
      <div class="tile"><div class="t-label">Helper data</div><div class="t-value">${feasible[0] ? feasible[0].helper_bits.toLocaleString() : '–'} <small class="muted">bits</small></div></div>
    </div>
    <div class="grid grid-2">
      ${chartCard('k-scatter', 'Cost vs failure probability', 'Every code × repetition combination')}
      ${chartCard('k-sens', `BER sensitivity · ${sel ? `${sel.repetition > 1 ? `Rep(${sel.repetition}) + ` : ''}${esc(sel.code)}` : '—'}`, 'Key failure if the error rate drifts (select a row below)')}
    </div>
    <section class="card"><div class="card-head"><div style="flex:1;min-width:200px"><h3>Key-failure landscape</h3><p class="card-sub">log₁₀ key failure over bit error rate × repetition factor for the outer code below (key length and min-entropy from the form)</p></div>
        <label class="field" style="width:200px"><span class="sr-only">Outer code</span><select id="k3-code">${[...new Set(plans.map((p) => p.code))].map((c) => `<option ${c === (ui.code3d || feasible[0]?.code || 'BCH(127,64,10)') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <div class="chart-tools no-print"><button class="btn small ghost" data-act="csv" data-chart="k-3d">CSV</button><button class="btn small ghost" data-act="svg" data-chart="k-3d">SVG</button><button class="btn small ghost" data-act="png" data-chart="k-3d">PNG</button></div></div>
      <div class="chart" id="k-3d"></div></section>
    <section class="card"><div class="card-head"><h3>Configurations</h3><span class="small muted">sorted by PUF bits; click a row to inspect</span></div>
      <div class="table-wrap" style="max-height:460px"><table class="data-table"><thead><tr><th>Outer code</th><th class="num">Rep.</th><th class="num">Blocks</th><th class="num">PUF bits</th><th class="num">Helper bits</th><th class="num">Inner BER</th><th class="num">Key failure</th><th>Status</th></tr></thead><tbody>
      ${plans.slice(0, 60).map((p) => `<tr data-plan="${p.code}|${p.repetition}" style="cursor:pointer${sel === p ? ';outline:2px solid var(--accent)' : ''}"><td><b>${p.code}</b></td><td class="num">${p.repetition}</td><td class="num">${p.blocks}</td><td class="num">${p.puf_bits.toLocaleString()}</td><td class="num">${p.helper_bits.toLocaleString()}</td><td class="num">${fmtNum(p.inner_ber)}</td><td class="num">${fmtNum(p.failure)}</td><td>${statusBadge(p.feasible ? 'good' : 'poor', p.feasible ? 'Meets target' : 'Misses')}</td></tr>`).join('')}
      </tbody></table></div></section>
  </div>`;
  bindChartTools(root, ctx);
  const ok = plans.filter((p) => p.feasible), bad = plans.filter((p) => !p.feasible), fl = (v) => Math.max(v, 1e-30);
  plot($('#k-scatter'), { height: 300, x: { label: 'PUF bits required', type: 'log', format: (v) => (v >= 1000 ? `${v / 1000}k` : v) }, y: { label: 'Key failure probability', type: 'log', domain: [1e-30, 1] }, layers: [
    { type: 'scatter', x: bad.map((p) => p.puf_bits), y: bad.map((p) => fl(p.failure)), name: 'Misses target', slot: 1 },
    { type: 'scatter', x: ok.map((p) => p.puf_bits), y: ok.map((p) => fl(p.failure)), name: 'Meets target', slot: 2 },
    { type: 'hline', y: ui.target, label: `target ${ui.target.toExponential(0)}` }], hover: false });
  if (sel) {
    const ps = idx(60).map((i) => 0.001 + i * 0.005).filter((p) => p < 0.3);
    const fail = ps.map((p) => { const pb = blockFailure(repetitionError(p, sel.repetition), sel.n, sel.t); return pb <= 0 ? 1e-30 : Math.max(-Math.expm1(sel.blocks * Math.log1p(-Math.min(pb, 1 - 1e-16))), 1e-30); });
    plot($('#k-sens'), { height: 300, x: { label: 'Bit error rate p' }, y: { label: 'Key failure', type: 'log', domain: [1e-30, 1] }, layers: [{ type: 'line', x: ps, y: fail, name: 'Key failure', slot: 6 }, { type: 'vline', x: ui.ber, label: 'design p' }, { type: 'hline', y: ui.target, label: 'target' }] });
  } else $('#k-sens').innerHTML = '<p class="muted">No feasible configuration — lower the BER, relax the target or improve entropy.</p>';
  {
    const code = ui.code3d || feasible[0]?.code || 'BCH(127,64,10)', [, n, k, t] = CODES.find((c) => c[0] === code) || CODES[12];
    const reps = [1, 3, 5, 7, 9, 11, 13, 15], bers = idx(24).map((i) => 0.005 + i * 0.01);
    const z = reps.map((r) => bers.map((p) => {
      const bpb = n * r, residual = bpb * ui.h - (bpb - k); if (residual <= 0) return null;
      const blocks = Math.ceil(ui.key / residual), pb = blockFailure(repetitionError(p, r), n, t);
      const f = pb <= 0 ? 1e-40 : pb >= 1 ? 1 : -Math.expm1(blocks * Math.log1p(-pb));
      return Math.max(-40, Math.log10(Math.max(f, 1e-40)));
    }));
    if (z.flat().some((v) => v !== null)) surface3d($('#k-3d'), { x: bers, y: reps, z, xLabel: 'BER p', yLabel: 'repetition r', zLabel: 'log₁₀ failure', zDomain: [-40, 0], scale: 'sequential', tip: (i, j, v) => `<div class="tip-head">p = ${fmt(bers[i], 3)} · r = ${reps[j]}</div>log₁₀ failure <b>${fmt(v, 2)}</b>` });
    else $('#k-3d').innerHTML = '<p class="muted">Helper data leaks all entropy for this code at the given min-entropy.</p>';
    $('#k3-code').onchange = (ev) => { ui.code3d = ev.target.value; keysView(ctx, root); };
  }
  $('#k-form').onchange = (ev) => { const f = new FormData(ev.currentTarget); Object.assign(ui, { ber: Math.min(0.45, Math.max(1e-5, +f.get('ber'))), h: Math.min(1, Math.max(0.01, +f.get('h'))), key: +f.get('key'), target: +f.get('target'), sel: null }); keysView(ctx, root); };
  $$('[data-plan]').forEach((tr) => (tr.onclick = () => { ui.sel = tr.dataset.plan; keysView(ctx, root); }));
}

// ================================================================= COMPARE
function compareView(ctx, root) {
  const done = ctx.state.entries.filter((e) => e.result);
  if (done.length < 2) { root.innerHTML = `<div class="card empty">${ICONS.compare}<h2>Compare needs two or more datasets</h2><p class="muted">Simulate different PUF types or import several batches, then compare them side by side.</p><a class="btn primary" href="#/data">Go to data</a></div>`; return; }
  const ui = ctx.state.ui; ui.cmp = (ui.cmp || done.slice(-3).map((e) => e.id)).filter((id) => done.some((e) => e.id === id));
  const sel = done.filter((e) => ui.cmp.includes(e.id));
  const metrics = [['Uniformity (%)', (r) => r.uniformity.mean], ['Bit-aliasing σ (%)', (r) => r.bit_aliasing.std], ['Uniqueness (%)', (r) => r.uniqueness?.mean], ['Reliability (%)', (r) => r.reliability?.mean], ['Mean BER', (r) => r.ber?.mean, 4], ["Decidability d'", (r) => r.identification?.decidability], ['EER', (r) => r.identification?.eer, 4], ['Min-entropy / bit', (r) => r.entropy.min_entropy_mean, 4], ['Markov min-entropy', (r) => r.entropy.markov_min_entropy, 4], ['NIST passes', (r) => r.nist ? r.nist.tests.filter((t) => t.passed).length : NaN, 0], ['Quality index', (r) => qualityIndex(r), 1]];
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <section class="card"><div class="card-head"><div><h2>Datasets to compare</h2><p class="card-sub">Radar shows up to three datasets (colour-safe limit); the table shows all selected.</p></div></div>
      <div class="row">${done.map((e) => `<label class="chip" style="cursor:pointer;padding:8px 14px"><input type="checkbox" data-cmp="${e.id}" ${ui.cmp.includes(e.id) ? 'checked' : ''}> ${esc(e.ds.name)}</label>`).join('')}</div></section>
    <div class="grid grid-2">
      ${chartCard('cmp-radar', 'Quality fingerprints', 'Normalised scores (0–100)')}
      ${chartCard('cmp-bar', 'Quality index', 'Heuristic composite score')}
    </div>
    <section class="card"><div class="card-head"><h3>Side-by-side metrics</h3><button class="btn small" id="cmp-csv">CSV</button><button class="btn small" id="cmp-tex">LaTeX</button></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Metric</th>${sel.map((e) => `<th class="num">${esc(e.ds.name)}</th>`).join('')}</tr></thead><tbody>
      ${metrics.map(([n, f, d = 2]) => `<tr><td><b>${n}</b></td>${sel.map((e) => `<td class="num">${fmt(f(e.result), d)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div></section>
  </div>`;
  bindChartTools(root, ctx);
  const sc = sel.map((e) => scores(e.result)), axes = Object.keys(sc[0] || {}).filter((k) => sc.every((s) => k in s));
  radar($('#cmp-radar'), { axes, series: sel.slice(0, 3).map((e, i) => ({ name: e.ds.name, values: axes.map((a) => sc[i][a]) })) });
  plot($('#cmp-bar'), { x: { label: 'Dataset', ticks: idx(sel.length), format: (v) => (sel[Math.round(v)] ? sel[Math.round(v)].ds.name.slice(0, 14) : ''), tipFormat: (v) => esc(sel[v]?.ds.name) }, y: { label: 'Quality index', domain: [0, 100] }, layers: [{ type: 'bar', x: idx(sel.length), y: sel.map((e) => qualityIndex(e.result)), name: 'Quality index', slot: 6, barFrac: 0.55 }] });
  $$('[data-cmp]').forEach((c) => (c.onchange = () => { ui.cmp = $$('[data-cmp]').filter((x) => x.checked).map((x) => x.dataset.cmp); compareView(ctx, root); }));
  const table = (sep, end = '') => [['Metric', ...sel.map((e) => e.ds.name)], ...metrics.map(([n, f, d = 2]) => [n, ...sel.map((e) => fmt(f(e.result), d))])].map((r) => r.join(sep) + end).join('\n');
  $('#cmp-csv').onclick = () => download('puf-comparison.csv', table(','), 'text/csv');
  $('#cmp-tex').onclick = () => download('puf-comparison.tex', `\\begin{tabular}{l${'r'.repeat(sel.length)}}\n\\toprule\n${table(' & ', ' \\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/'/g, "$'$").split('\n').map((l, i) => (i === 1 ? '\\midrule\n' + l : l)).join('\n')}\n\\bottomrule\n\\end{tabular}\n`, 'application/x-tex');
}

// ================================================================= REPORT
function methodsParagraph(e, st) {
  const r = e.result, m = r.meta, md = e.ds.metadata || {};
  const src = md.simulator ? `a synthetic population generated with the ${{ arbiter: (md.params?.xor > 1 ? `${md.params.xor}-XOR ` : '') + `${md.params?.stages}-stage Arbiter PUF additive delay model`, ro: 'ring-oscillator PUF model', sram: 'SRAM power-up PUF model', ideal: 'ideal random PUF model' }[md.simulator]} (seed ${md.seed})` : 'measured responses';
  return `We evaluated ${m.devices} PUF instances with ${m.bits}-bit responses (${m.measurements_total} read-outs in total${m.conditions.length > 1 ? ` across ${m.conditions.length} operating conditions: ${m.conditions.join(', ')}` : ''}) obtained from ${src}. We report uniformity, bit-aliasing, uniqueness (mean pairwise inter-device fractional Hamming distance) and reliability (100% minus the mean intra-device fractional Hamming distance to the ${st.reference === 'first' ? 'enrolment read-out' : 'majority-vote reference'}), with ${Math.round((1 - st.alpha) * 100)}% percentile-bootstrap confidence intervals over devices (B = ${st.bootstrap}, seed ${st.seed}). Identification performance is summarised by the decidability index d', the empirical equal error rate and false-acceptance/false-rejection rates extrapolated with a binomial model. Randomness of the concatenated enrolled responses was assessed with eight tests of NIST SP 800-22 at α = ${st.nistAlpha}, and min-entropy with the Most-Common-Value and Markov estimators of NIST SP 800-90B. All analyses were performed with PUFAnalytics v${VERSION} [1].`;
}
function reportView(ctx, root) {
  const e = needData(ctx, root, 'report generation'); if (!e) return;
  const r = e.result, st = ctx.state.settings, md = toMarkdown(r), name = slug(e.ds.name);
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <section class="card"><div class="card-head"><div><h2>Export</h2><p class="card-sub">Everything needed to publish and reproduce this evaluation.</p></div></div>
      <div class="btn-group">
        <button class="btn primary" data-dl="md">${ICONS.download} Markdown report</button>
        <button class="btn" data-dl="tex">${ICONS.download} LaTeX table</button>
        <button class="btn" data-dl="json">${ICONS.download} Full JSON</button>
        <button class="btn" data-dl="py">${ICONS.download} Python reproduction script</button>
        <button class="btn" data-dl="csv">${ICONS.download} Dataset CSV</button>
        <button class="btn" id="bib">${ICONS.copy} Copy BibTeX</button>
        <button class="btn" id="print">${ICONS.print} Print / PDF</button>
      </div></section>
    <section class="card"><div class="card-head"><div><h3>Methods paragraph</h3><p class="card-sub">Auto-generated description of this evaluation for your paper — edit freely.</p></div><button class="btn small" id="copy-methods">${ICONS.copy} Copy</button></div>
      <p id="methods" class="inset" style="margin:0">${esc(methodsParagraph(e, st))}</p>
      <ol class="ref-list small" style="margin-top:12px">${REFS.map((x) => `<li>${x}</li>`).join('')}</ol></section>
    <div class="grid grid-2">
      <section class="card"><div class="card-head"><h3>Report preview (Markdown)</h3></div><pre class="code" style="max-height:520px">${esc(md)}</pre></section>
      <section class="card"><div class="card-head"><h3>Python reproduction</h3></div><pre class="code" style="max-height:520px">${esc(toPython(e.ds, st, `${name}.csv`))}</pre></section>
    </div>
  </div>`;
  const files = { md: [`${name}-report.md`, () => md, 'text/markdown'], tex: [`${name}-metrics.tex`, () => toLatex(r), 'application/x-tex'], json: [`${name}-analysis.json`, () => toJSON(r), 'application/json'], py: [`reproduce_${name.replace(/-/g, '_')}.py`, () => toPython(e.ds, st, `${name}.csv`), 'text/x-python'], csv: [`${name}.csv`, () => toCSV(e.ds), 'text/csv'] };
  $$('[data-dl]').forEach((b) => (b.onclick = () => { const [f, c, mime] = files[b.dataset.dl]; download(f, c(), mime); }));
  $('#bib').onclick = () => copyText(BIBTEX);
  $('#print').onclick = () => window.print();
  $('#copy-methods').onclick = () => copyText($('#methods').textContent + '\n\n' + REFS.map((x, i) => `[${i + 1}] ${x.replace(/<[^>]+>/g, '')}`).join('\n'));
}
export const REFS = [
  'K. K. Mondal, A. Gupta, D. Das, “PUFAnalytics: Python library for comprehensive evaluation and analysis of PUFs,” in <i>Proc. 2025 30th Asia-Pacific Conference on Communications (APCC)</i>, IEEE, Nov. 2025, pp. 1–6, doi:10.23919/apcc64555.2025.11279762.',
];

export const VIEWS = { overview, data: dataView, metrics: metricsView, identify: identifyView, randomness: randomnessView, figures: figuresView, sweep: sweepView, attack: attackView, keys: keysView, compare: compareView, report: reportView, docs: (ctx, root) => renderDocs(root, REFS) };
