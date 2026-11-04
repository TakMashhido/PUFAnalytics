// Cross-language parity test: the browser engine must reproduce the Python package.
// Run: node web/tests/parity.test.mjs   (regenerate golden data with: python tests/make_golden.py)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PortableRNG } from '../js/core/rng.js';
import { simulate } from '../js/core/simulators.js';
import { toDict, parseText } from '../js/core/dataset.js';
import { analyze } from '../js/core/analyze.js';
import { simulatedAttack } from '../js/core/attacks.js';
import { sweep } from '../js/core/sweep.js';
import { tmvBer } from '../js/core/quality.js';
import { identificationVsLength } from '../js/core/stats.js';
import { planKeyGeneration } from '../js/core/ecc.js';
import * as NIST from '../js/core/nist.js';
import { igamc, binomCdf, binomSf } from '../js/core/stats.js';

const here = dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.error('FAIL', msg); } };
const close = (a, b, tol, msg) => {
  if (a === null || b === null || a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) {
    const na = a === null || a === undefined || Number.isNaN(a) || !Number.isFinite(a), nb = b === null || b === undefined || Number.isNaN(b) || !Number.isFinite(b);
    return ok(na && nb, `${msg}: ${a} vs ${b}`);
  }
  ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: js=${a} py=${b}`);
};
const closeArr = (a, b, tol, msg) => { ok(a.length === b.length, `${msg} length ${a.length} vs ${b.length}`); for (let i = 0; i < Math.min(a.length, b.length); i++) close(a[i], b[i], tol, `${msg}[${i}]`); };

// RNG streams
const r = new PortableRNG(42); ok(JSON.stringify(G.rng_u32) === JSON.stringify(Array.from({ length: 16 }, () => r.nextU32())), 'rng u32 stream');
const r2 = new PortableRNG(2024); closeArr(Array.from(r2.normals(16)), G.rng_normals, 1e-13, 'rng normals');

// special functions
close(igamc(3.5, 2.2), 0.7327230835638652, 1e-12, 'igamc (scipy gammaincc)');
close(binomCdf(10, 128, 0.05), 0.943426270043151, 1e-12, 'binomCdf (scipy)');
ok(Math.abs(binomSf(30, 128, 0.05) / 1.862625624251927e-13 - 1) < 1e-9, 'binomSf deep tail (scipy)');

// NIST worked examples (SP 800-22 section 2.x.8)
const bits = (s) => Uint8Array.from(s, (c) => +c);
const e = bits('1100100100001111110110101010001000100001011010001100001000110100110001001100011001100010100010111000');
close(NIST.monobit(e, 0.01, false).p_value, 0.109599, 2e-6, 'monobit example');
close(NIST.blockFrequency(e, 0.01, 10, false).p_value, 0.706438, 2e-6, 'block frequency example');
close(NIST.runs(e, 0.01, false).p_value, 0.500798, 2e-6, 'runs example');
closeArr(NIST.cumulativeSums(e, 0.01, false).p_values, [0.219194, 0.114866], 2e-6, 'cusum example');
close(NIST.approximateEntropy(e, 0.01, 2, false).p_value, 0.235301, 2e-6, 'apen example');
closeArr(NIST.serial(bits('0011011101'), 0.01, 3, false).p_values, [0.808792, 0.670320], 2e-6, 'serial example');
close(NIST.spectral(e, 0.01, false).p_value, 0.646355, 2e-6, 'spectral example (Bluestein n=100)');

// Simulators + full analysis
for (const c of G.cases) {
  const tag = `${c.spec.model}#${c.spec.seed}`;
  const ds = simulate({ ...c.spec });
  const d = toDict(ds);
  let diff = 0, tot = 0;
  d.responses.forEach((dev, i) => dev.forEach((resp, m) => { const p = c.dataset.responses[i][m]; for (let k = 0; k < resp.length; k++) { tot++; if (resp[k] !== p[k]) diff++; } }));
  ok(diff === 0, `${tag}: simulated bits identical (${diff}/${tot} differ)`);
  if (c.dataset.challenges) ok(JSON.stringify(d.challenges) === JSON.stringify(c.dataset.challenges), `${tag}: challenges identical`);
  const res = analyze(ds, { bootstrap: 200, seed: 99 });
  const py = c.result;
  for (const key of ['uniformity', 'bit_aliasing', 'uniqueness', 'reliability', 'steadiness']) if (py[key]) { close(res[key].mean, py[key].mean, 1e-10, `${tag} ${key}.mean`); close(res[key].std, py[key].std, 1e-10, `${tag} ${key}.std`); }
  close(res.ber.mean, py.ber.mean, 1e-12, `${tag} ber`); closeArr(res.ber.per_bit, py.ber.per_bit, 1e-12, `${tag} ber.per_bit`);
  close(res.stable_bits, py.stable_bits, 1e-12, `${tag} stable bits`);
  closeArr(res.inter_hd.histogram, py.inter_hd.histogram, 0, `${tag} inter hist`);
  closeArr(res.intra_hd.histogram, py.intra_hd.histogram, 0, `${tag} intra hist`);
  close(res.inter_hd.fit.chi2, py.inter_hd.fit.chi2, 1e-8, `${tag} inter fit chi2`);
  const idn = res.identification, pid = py.identification;
  close(idn.decidability, pid.decidability, 1e-9, `${tag} decidability`); close(idn.eer, pid.eer, 1e-12, `${tag} eer`);
  ok(idn.binomial.threshold === pid.binomial.threshold, `${tag} binomial threshold ${idn.binomial.threshold} vs ${pid.binomial.threshold}`);
  close(idn.binomial.far, pid.binomial.far, 1e-7, `${tag} binomial far`); close(idn.binomial.frr, pid.binomial.frr, 1e-7, `${tag} binomial frr`);
  for (const k of ['shannon_mean', 'min_entropy_mean', 'stream_shannon', 'mcv_min_entropy', 'markov_min_entropy', 'lz_complexity']) close(res.entropy[k], py.entropy[k], 1e-10, `${tag} entropy.${k}`);
  close(res.correlation.mean_abs, py.correlation.mean_abs, 1e-9, `${tag} corr mean_abs`);
  closeArr(res.correlation.autocorrelation, py.correlation.autocorrelation, 1e-10, `${tag} autocorr`);
  for (const [cond, v] of Object.entries(py.conditions)) close(res.conditions[cond].ber, v.ber, 1e-12, `${tag} condition ${cond}`);
  res.nist.tests.forEach((t, i) => {
    const p = py.nist.tests[i]; ok(t.applicable === p.applicable, `${tag} nist ${t.name} applicability`);
    if (t.applicable) closeArr(t.p_values, p.p_values, 1e-7, `${tag} nist ${t.name}`);
  });
  for (const k of ['uniformity', 'uniqueness', 'reliability', 'bit_aliasing']) {
    close(res.confidence_intervals[k].low, py.confidence_intervals[k].low, 1e-9, `${tag} CI ${k} low`);
    close(res.confidence_intervals[k].high, py.confidence_intervals[k].high, 1e-9, `${tag} CI ${k} high`);
  }
}

// Data exchange: a hex CSV written by Python is parsed identically by the browser
const parsed = toDict(parseText(G.csv_hex));
ok(JSON.stringify(parsed.responses) === JSON.stringify(G.csv_hex_dataset.responses), 'hex CSV import (responses)');
ok(JSON.stringify(parsed.conditions) === JSON.stringify(G.csv_hex_dataset.conditions), 'hex CSV import (conditions)');

// Modelling attack and ECC planner
const A = simulatedAttack({ stages: 16, xor: 1, noise: 0.05, train_sizes: [50, 200, 800], test_size: 500, seed: 4 });
closeArr(A.train_sizes, G.attack.train_sizes, 0, 'attack sizes'); closeArr(A.test_accuracy, G.attack.test_accuracy, 0.01, 'attack test accuracy');
const P = planKeyGeneration(0.08, 0.9, 128, 1e-6).slice(0, 10);
P.forEach((p, i) => { ok(p.code === G.ecc[i].code && p.repetition === G.ecc[i].repetition, `ecc row ${i} config`); close(p.failure, G.ecc[i].failure, 1e-7, `ecc row ${i} failure`); });

// Temporal majority voting, length curve, sweeps, attacks on new models
const T = tmvBer(simulate({ model: 'sram', n_devices: 6, n_bits: 64, n_repeats: 7, seed: 31, params: { noise: 0.4 } }));
closeArr(T.ber, G.tmv.ber, 1e-10, 'TMV BER');
closeArr(identificationVsLength(0.06, 0.49, [8, 16, 33, 64, 128]).error, G.length.error, 1e-7, 'identification vs length');
const SW = sweep({ model: 'arbiter', param: 'noise', values: [0.02, 0.2], param2: 'n_devices', values2: [4, 9], seeds: 2, seed: 5, n_devices: 6, n_bits: 48, n_repeats: 3, params: { stages: 16 } });
for (const k of Object.keys(G.sweep.mean)) { closeArr(SW.mean[k].flat(), G.sweep.mean[k].flat(), 1e-9, `sweep mean ${k}`); closeArr(SW.std[k].flat(), G.sweep.std[k].flat(), 1e-9, `sweep std ${k}`); }
const AF = simulatedAttack({ stages: 16, noise: 0.05, train_sizes: [100, 400], test_size: 300, seed: 3, model: 'ff_arbiter', params: { loops: 1 } });
closeArr(AF.test_accuracy, G.attack_ff.test_accuracy, 0.01, 'ff-arbiter attack accuracy');

console.log(`${checks - failures}/${checks} parity checks passed`);
if (failures) process.exit(1);
