// Report generation (Markdown / LaTeX / JSON / Python reproduction / BibTeX) and quality scoring.
import { fmt } from './ui.js';

export const VERSION = '2.0.0';
export const BIBTEX = `@inproceedings{mondal2025pufanalytics,
  title = {PUFAnalytics: Python Library for Comprehensive Evaluation and Analysis of PUFs},
  url = {http://dx.doi.org/10.23919/apcc64555.2025.11279762},
  DOI = {10.23919/apcc64555.2025.11279762},
  booktitle = {2025 30th Asia-Pacific Conference on Communications (APCC)},
  publisher = {IEEE},
  author = {Mondal, Koustav Kumar and Gupta, Ashi and Das, Debasis},
  year = {2025},
  month = Nov,
  pages = {1–6}
}`;

const clamp = (v) => Math.max(0, Math.min(1, v));
/** Normalised 0..1 quality scores (heuristic, documented in Docs → Quality index). */
export function scores(r) {
  const s = {};
  s.Uniformity = clamp(1 - Math.abs(r.uniformity.mean - 50) / 50);
  const ba = r.bit_aliasing.per_bit; let dev = 0; for (const v of ba) dev += Math.abs(v - 50); s['Bit-aliasing'] = clamp(1 - dev / ba.length / 50);
  if (r.uniqueness) s.Uniqueness = clamp(1 - Math.abs(r.uniqueness.mean - 50) / 50);
  if (r.ber) s.Reliability = clamp(1 - 4 * r.ber.mean);
  s['Min-entropy'] = clamp(r.entropy.min_entropy_mean);
  if (r.identification) s.Identifiability = clamp(r.identification.decidability / 10);
  if (r.nist) { const ap = r.nist.tests.filter((t) => t.applicable); if (ap.length) s.Randomness = ap.filter((t) => t.passed).length / ap.length; }
  return s;
}
export function qualityIndex(r) { const v = Object.values(scores(r)); return v.length ? (100 * v.reduce((a, b) => a + b, 0)) / v.length : NaN; }

export function status(metric, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'na';
  const d = Math.abs(v - 50);
  switch (metric) {
    case 'uniformity': case 'uniqueness': case 'bit_aliasing': return d < 2.5 ? 'good' : d < 7.5 ? 'fair' : 'poor';
    case 'reliability': return v >= 97 ? 'good' : v >= 90 ? 'fair' : 'poor';
    case 'entropy': return v >= 0.9 ? 'good' : v >= 0.7 ? 'fair' : 'poor';
    case 'decidability': return v >= 6 ? 'good' : v >= 3 ? 'fair' : 'poor';
    case 'ber': return v <= 0.03 ? 'good' : v <= 0.1 ? 'fair' : 'poor';
    case 'index': return v >= 85 ? 'good' : v >= 65 ? 'fair' : 'poor';
    default: return 'na';
  }
}

function rows(r) {
  const ci = r.confidence_intervals || {};
  const c = (k) => (ci[k] ? `[${fmt(ci[k].low)}, ${fmt(ci[k].high)}]` : '');
  const o = [['Uniformity (%)', fmt(r.uniformity.mean), '50', c('uniformity')], ['Bit-aliasing (%)', fmt(r.bit_aliasing.mean), '50', c('bit_aliasing')]];
  if (r.uniqueness) o.push(['Uniqueness (%)', fmt(r.uniqueness.mean), '50', c('uniqueness')]);
  if (r.reliability) o.push(['Reliability (%)', fmt(r.reliability.mean), '100', c('reliability')], ['Steadiness (%)', fmt(r.steadiness.mean), '100', ''], ['Mean BER', fmt(r.ber.mean, 4), '0', ''], ['Stable bits', fmt(r.stable_bits, 4), '1', '']);
  if (r.identification) {
    const i = r.identification;
    o.push(["Decidability d'", fmt(i.decidability), '> 6', ''], ['Empirical EER', fmt(i.eer, 4), '0', ''],
      [`Binomial FAR @ t*=${i.binomial.threshold}`, fmt(i.binomial.far, 3), '0', ''], [`Binomial FRR @ t*=${i.binomial.threshold}`, fmt(i.binomial.frr, 3), '0', '']);
  }
  const e = r.entropy;
  o.push(['Shannon entropy / bit', fmt(e.shannon_mean, 4), '1', ''], ['Min-entropy / bit', fmt(e.min_entropy_mean, 4), '1', ''],
    ['MCV min-entropy (SP 800-90B)', fmt(e.mcv_min_entropy, 4), '1', ''], ['Markov min-entropy (SP 800-90B)', fmt(e.markov_min_entropy, 4), '1', '']);
  return o;
}

export function toMarkdown(r) {
  const m = r.meta;
  const L = [`# PUF evaluation report: ${m.name}`, '', `*${m.devices} devices, ${m.bits} bits, ${m.measurements_total} measurements (reference: ${m.reference}), generated ${m.generated} with PUFAnalytics ${VERSION}.*`, '',
    `PUF quality index (heuristic): **${fmt(qualityIndex(r), 1)} / 100**`, '', '## Headline metrics', '',
    `| Metric | Value | Ideal | ${r.confidence_intervals ? Math.round(100 * r.confidence_intervals.level) + '% CI' : 'CI'} |`, '|---|---|---|---|'];
  for (const x of rows(r)) L.push(`| ${x.join(' | ')} |`);
  if (r.conditions && Object.keys(r.conditions).length) {
    L.push('', '## Bit error rate per operating condition', '', '| Condition | BER | Measurements |', '|---|---|---|');
    for (const [c, v] of Object.entries(r.conditions)) L.push(`| ${c} | ${fmt(v.ber, 4)} | ${v.n} |`);
  }
  if (r.nist) {
    L.push('', `## NIST SP 800-22 (alpha = ${r.nist.alpha}, n = ${r.nist.n} bits)`, '', '| Test | p-value | Result |', '|---|---|---|');
    for (const t of r.nist.tests) L.push(`| ${t.name} | ${fmt(t.p_value, 4)} | ${!t.applicable ? `n/a (${t.note})` : t.passed ? 'PASS' : 'FAIL'} |`);
  }
  if (r.confidence_intervals) L.push('', `Confidence intervals: percentile bootstrap over devices, ${r.confidence_intervals.resamples} resamples, seed ${r.confidence_intervals.seed}.`);
  return L.join('\n') + '\n';
}

export function toLatex(r) {
  const esc = (s) => String(s).replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/'/g, "$'$").replace(/@/g, 'at').replace(/\*/g, '$^*$').replace(/> /g, '$>$ ');
  const m = r.meta;
  const L = ['\\begin{table}[t]', '\\centering', `\\caption{Evaluation of ${esc(m.name)} (${m.devices} devices, ${m.bits}-bit responses).}`, '\\label{tab:puf-metrics}', '\\begin{tabular}{lrrr}', '\\toprule', 'Metric & Value & Ideal & CI \\\\', '\\midrule'];
  for (const x of rows(r)) L.push(x.map(esc).join(' & ') + ' \\\\');
  L.push('\\bottomrule', '\\end{tabular}', '\\end{table}');
  return L.join('\n') + '\n';
}

const clean = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 2);
export const toJSON = (r) => clean(r);

const pyVal = (v) => (typeof v === 'string' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'True' : 'False') : v === null ? 'None' : String(v));
export function toPython(ds, settings, fileName) {
  const md = ds.metadata || {};
  let load;
  if (md.simulator) {
    const p = Object.entries(md.params || {}).map(([k, v]) => `${k}=${pyVal(v)}`);
    const cond = (md.conditions || []).map(([l, s]) => `(${JSON.stringify(l)}, ${s})`).join(', ');
    load = `ds = pa.simulate(\n    ${JSON.stringify(md.simulator)},\n    n_devices=${ds.devices.length}, n_bits=${ds.nBits}, n_repeats=${md.n_repeats}, seed=${md.seed},\n    conditions=[${cond}],\n${p.length ? '    ' + p.join(', ') + ',\n' : ''})`;
  } else load = `ds = pa.PUFDataset.from_file(${JSON.stringify(fileName)})  # exported from the web app`;
  return `"""Reproduce the PUFAnalytics web-app analysis of '${ds.name}'.

pip install "git+https://github.com/TakMashhido/PUFAnalytics.git"
The browser engine and the Python package are parity-tested, so the numbers
printed below match the web application exactly.
"""
import pufanalytics as pa

${load}
result = pa.analyze(ds, reference=${JSON.stringify(settings.reference)}, bootstrap=${settings.bootstrap}, seed=${settings.seed}, alpha=${settings.alpha}, nist_alpha=${settings.nistAlpha})
print(pa.to_markdown(result))
pa.to_latex(result, "puf_metrics.tex")
pa.to_json(result, "puf_metrics.json")
`;
}
