// Methods & documentation view. Formulas are rendered with KaTeX when it is reachable.
import { $$, BIB } from './docs-helpers.js';

let katexPromise = null;
function loadKatex() {
  if (window.katex) return Promise.resolve(window.katex);
  if (katexPromise) return katexPromise;
  katexPromise = new Promise((resolve) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'; s.async = true;
    s.onload = () => resolve(window.katex); s.onerror = () => resolve(null); document.head.appendChild(s);
  });
  return katexPromise;
}
const F = (tex) => `<div class="formula" data-tex="${tex.replace(/"/g, '&quot;')}"><code>${tex.replace(/</g, '&lt;')}</code></div>`;

const SECTIONS = [
  ['start', 'Getting started', `
    <p>PUFAnalytics evaluates a <b>population</b> of PUF instances (devices), each measured one or more times (read-outs), possibly under different <b>operating conditions</b>. The first read-out of each device is its <b>enrolment</b> reference (alternatively, the bitwise majority vote over all read-outs can be used).</p>
    <ol><li>Go to <a href="#/data">Data &amp; simulation</a>; import a file or simulate a population.</li><li>Inspect the <a href="#/overview">Overview</a>, then drill into metrics, identification and randomness.</li><li>Use <a href="#/report">Report &amp; export</a> for figures, LaTeX tables, a methods paragraph and a Python script that reproduces every number.</li></ol>
    <p>All computations run locally in a Web Worker; your data never leaves the browser. Datasets persist in IndexedDB until deleted.</p>`],
  ['formats', 'Data formats', `
    <p>Text files may use comma, semicolon, tab or whitespace separators; <code>#</code> starts a comment. Responses are binary (<code>0110…</code>) or hexadecimal (<code>0x3fa…</code>, 4 bits per digit). In auto mode a file is treated as binary only if <i>every</i> response consists of 0/1 characters.</p>
<pre>device,measurement,condition,response
chipA,0,25C,0xA3F1C29B7E4D0516
chipA,1,85C,0xA3F1C2997E4D0716
chipB,0,25C,0x5C0E3D64819BF2E9</pre>
    <p>Also accepted: one response per line (one device each), <code>device,response</code> (repeated rows are re-measurements), NumPy <code>.npy</code> arrays of shape <code>(devices, bits)</code> or <code>(devices, measurements, bits)</code>, and the JSON written by <code>PUFDataset.to_dict()</code> in Python.</p>`],
  ['metrics', 'Quality metrics', `
    <p>Let \\(k\\) devices have \\(n\\)-bit reference responses \\(R_i\\) and let \\(R_{i,t}\\) be the \\(t\\)-th of \\(T\\) re-measurements of device \\(i\\). \\(\\mathrm{HD}\\) is the Hamming distance and \\(\\mathrm{HW}\\) the Hamming weight.</p>
    <div class="def-grid">
      <div><h3>Uniformity</h3>${F('U_i = \\frac{1}{n}\\,\\mathrm{HW}(R_i)\\times 100\\%')}<p class="small muted">Ideal 50%: balanced 0s and 1s within a response.</p></div>
      <div><h3>Bit-aliasing</h3>${F('B_l = \\frac{1}{k}\\sum_{i=1}^{k} r_{i,l}\\times 100\\%')}<p class="small muted">Ideal 50% for every bit position \\(l\\); systematic bias shows up as outliers.</p></div>
      <div><h3>Uniqueness</h3>${F('Q = \\frac{2}{k(k-1)}\\sum_{i<j}\\frac{\\mathrm{HD}(R_i,R_j)}{n}\\times 100\\%')}<p class="small muted">Ideal 50%. (PUFAnalytics &lt; 2.0 reported twice this value; fixed in 2.0.)</p></div>
      <div><h3>Reliability</h3>${F('\\mathrm{Rel}_i = 100\\% - \\frac{1}{T}\\sum_{t=1}^{T}\\frac{\\mathrm{HD}(R_i,R_{i,t})}{n}\\times 100\\%')}<p class="small muted">Ideal 100%. The mean intra-device fHD is the bit error rate (BER).</p></div>
      <div><h3>Steadiness</h3>${F('S_i = 100\\%\\,\\Big(1 + \\frac{1}{n}\\sum_{l}\\log_2\\max(p_{i,l},1-p_{i,l})\\Big)')}<p class="small muted">\\(p_{i,l}\\) is the empirical probability that bit \\(l\\) of device \\(i\\) reads 1.</p></div>
      <div><h3>Stable-bit ratio &amp; per-bit error rate</h3><p class="small">Fraction of (device, bit) cells that never flipped, and for every bit position the probability of differing from enrolment — the basis of dark-bit masking (available under Data → Pre-processing).</p></div>
    </div>
    <h3>Confidence intervals</h3><p>For uniformity, bit-aliasing, uniqueness and reliability, devices are resampled with replacement (\\(B\\) times, default 1000) and the percentile interval is reported. For uniqueness, pairs formed by a device with its own duplicate are excluded. Bootstrap indices come from the portable RNG, so intervals are identical in the browser and in Python for the same seed.</p>`],
  ['identification', 'Identification statistics', `
    <p>Intra-device distances (noise) and inter-device distances (uniqueness) are compared as in biometrics.</p>
    ${F("d' = \\frac{|\\mu_{\\text{inter}}-\\mu_{\\text{intra}}|}{\\sqrt{(\\sigma^2_{\\text{inter}}+\\sigma^2_{\\text{intra}})/2}}")}
    <p>With acceptance rule \\(\\mathrm{HD}\\le t\\): \\(\\mathrm{FRR}(t)=P(\\mathrm{HD}_{\\text{intra}}&gt;t)\\), \\(\\mathrm{FAR}(t)=P(\\mathrm{HD}_{\\text{inter}}\\le t)\\). Empirical curves cannot resolve rates below one over the number of comparisons, so the binomial model is also reported:</p>
    ${F('\\mathrm{FAR}(t)=\\sum_{i=0}^{t}\\binom{n}{i}p_{\\text{inter}}^{i}(1-p_{\\text{inter}})^{n-i},\\qquad \\mathrm{FRR}(t)=\\sum_{i=t+1}^{n}\\binom{n}{i}p_{\\text{intra}}^{i}(1-p_{\\text{intra}})^{n-i}')}
    <p>The threshold \\(t^*\\) minimises \\(\\max(\\mathrm{FAR},\\mathrm{FRR})\\). Tails are evaluated in log-space and stay accurate to below \\(10^{-300}\\). A chi-square goodness-of-fit p-value indicates how well the binomial model fits the observed distribution (bins with expected count ≥ 5).</p>`],
  ['randomness', 'Randomness tests & entropy', `
    <p>The concatenated enrolled responses are tested with eight NIST SP 800-22 tests: frequency (monobit), block frequency, runs, longest run of ones, cumulative sums (forward and backward), approximate entropy, serial (two p-values) and the discrete Fourier transform test (exact DFT for any length, via Bluestein's algorithm). Implementations reproduce the worked examples of the standard to six decimals. Tests whose minimum length is not met are flagged <i>not applicable</i>.</p>
    <ul><li><b>Population entropy</b> per bit position: \\(H_l = h(B_l)\\) and \\(H_{\\infty,l} = -\\log_2 \\max(B_l, 1-B_l)\\).</li>
    <li><b>SP 800-90B MCV</b>: \\(\\hat p\\) = most common value frequency, \\(p_u = \\min(1, \\hat p + 2.576\\sqrt{\\hat p(1-\\hat p)/(L-1)})\\), \\(H = -\\log_2 p_u\\).</li>
    <li><b>SP 800-90B Markov</b>: first-order transition probabilities; the min-entropy of the most likely 128-bit path (found by dynamic programming), divided by 128.</li>
    <li><b>LZ76 complexity</b>, normalised as \\(c(n)\\log_2 n / n\\) (≈ 1 for random data).</li>
    <li><b>Bit correlation</b>: Pearson φ between bit positions across devices; <b>autocorrelation</b> of the ±1-mapped responses with a 95% white-noise band \\(\\pm 1.96/\\sqrt{k(n-\\ell)}\\).</li></ul>`],
  ['simulators', 'Simulators', `
    <ul><li><b>Arbiter / k-XOR Arbiter PUF</b> — additive delay model: \\(r = \\operatorname{sgn}(\\mathbf w^\\top \\boldsymbol\\phi(\\mathbf c) + \\sigma\\varepsilon)\\), \\(\\phi_i=\\prod_{j\\ge i}(1-2c_j)\\), weights \\(\\mathcal N(0,1)\\); XOR of several independent chains.</li>
    <li><b>Ring-oscillator PUF</b> — frequencies \\(f = \\sigma_p\\,\\mathcal N(0,1) + g\\cdot x\\) with a deterministic spatial gradient \\(g\\) shared by all chips (reproduces the bit-aliasing bias of neighbour pairing), compared pairwise under measurement noise.</li>
    <li><b>SRAM PUF</b> — cell mismatch \\(\\mathcal N(\\beta, 1)\\) plus thermal noise at each power-up.</li>
    <li><b>Ideal PUF</b> — uniform random bits with independent flips (a reference for what perfect looks like at your sample size).</li></ul>
    <ul><li><b>Feed-forward Arbiter PUF</b> — stage-recursive delay model (\\(\\Delta \\leftarrow \\Delta + p_i\\) for \\(c_i=0\\), \\(\\Delta \\leftarrow -\\Delta + q_i\\) for \\(c_i=1\\)); each loop taps an intermediate arbiter whose noisy decision replaces the challenge bit of a later stage. Loops are evenly spaced and non-overlapping.</li>
    <li><b>(x, y)-Interpose PUF</b> — the response of an x-XOR Arbiter PUF is inserted at position \\(\\lfloor k/2 \\rfloor\\) of the challenge of a y-XOR Arbiter PUF with k + 1 stages.</li>
    <li><b>DRAM retention PUF</b> — a cell reads 1 when it decays during the refresh pause: \\(s + \\sigma\\varepsilon &lt; \\theta + \\gamma\\ln(\\text{scale})\\); hotter conditions (scale &gt; 1) accelerate decay and shift uniformity, a realistic environmental bias.</li></ul>
    <p>Operating conditions multiply the noise standard deviation. All random numbers come from <b>xoshiro128**</b> seeded with SplitMix32 and Box–Muller normals, drawn in a documented order that the Python package mirrors exactly: the same seed yields bit-identical populations in both environments (verified by an automated parity test with &gt;2,400 checks).</p>`],
  ['figures', 'Figure studio & extra analyses', `
    <p>The Figure studio renders publication figures from the active dataset — violin and box plots of per-device metrics, empirical CDFs, a Q-Q plot against the binomial model, ROC curves, polar bit-aliasing, entropy accumulation, bias-vs-instability scatter plots and interactive 3D surfaces, bars and scatter plots. 3D figures are drawn as SVG with orthographic projection; drag to rotate, scroll to zoom, and the current view is what gets exported. <b>Download all</b> bundles every figure as SVG, PNG and CSV with a captions file.</p>
    <ul><li><b>Temporal majority voting</b>: each cell's flip probability \\(p\\) is estimated against the device's majority-vote response; with \\(m\\) votes the residual error is \\(P[\\mathrm{Bin}(m,p) &gt; m/2]\\), averaged over cells.</li>
    <li><b>Identification vs response length</b>: \\(\\min_t \\max(\\mathrm{FAR}, \\mathrm{FRR})\\) of the binomial model at the measured intra/inter rates, for each length \\(n\\).</li>
    <li><b>Simulation studio</b>: grid point \\((i, j)\\) and replicate \\(r\\) use seed \\(s_0 + r\\) (common random numbers); the band is mean \\(\\pm 1.96\\,\\mathrm{sd}/\\sqrt{R}\\). The identical sweep runs in Python with <code>pa.sweep()</code>.</li></ul>`],
  ['attack', 'Modelling attacks', `
    <p>The additive delay model makes a single Arbiter PUF a linear threshold function of \\(\\boldsymbol\\phi(\\mathbf c)\\), so it can be learned from challenge–response pairs. The Attack lab also attacks Feed-forward and Interpose PUFs (CRPs generated by their simulators) and draws a 3D learnability landscape over stages × training-set size. It fits ridge-regularised logistic regression with Newton's method (\\(\\lambda = 10^{-2}\\)) on increasing training sets and reports held-out accuracy. XOR Arbiter PUFs are not linearly separable in \\(\\boldsymbol\\phi\\) and stay near 50% for this learner — this demonstrates resistance to <i>this attack only</i>, not security against stronger learners (multilayer perceptrons, CMA-ES, reliability-based attacks).</p>`],
  ['ecc', 'Key generation (fuzzy extractors)', `
    <p>A code-offset fuzzy extractor with an inner \\((r,1)\\) repetition code and an outer \\((n,k,t)\\) block code (BCH, Golay, Reed–Muller, Hamming) is sized for bit error rate \\(p\\) and min-entropy \\(h\\) per bit:</p>
    ${F('p_{\\text{in}} = P[\\mathrm{Bin}(r,p) > \\lfloor r/2 \\rfloor],\\quad P_b = P[\\mathrm{Bin}(n,p_{\\text{in}})>t],\\quad P_{\\text{fail}} = 1-(1-P_b)^{B}')}
    <p>Helper data leaks \\(nr-k\\) bits per block, so the residual entropy per block is \\(nrh-(nr-k)\\); the number of blocks \\(B\\) is chosen so the total residual entropy covers the key length. Use the worst-case condition BER for a conservative design. The model assumes independent bit errors and does not account for decoder-specific or side-channel leakage.</p>`],
  ['index', 'Quality index (heuristic)', `
    <p>The overview radar and quality index summarise seven normalised scores in [0, 1]: uniformity \\(1-|U-50|/50\\); bit-aliasing \\(1-\\overline{|B_l-50|}/50\\); uniqueness \\(1-|Q-50|/50\\); reliability \\(1-4\\,\\mathrm{BER}\\); min-entropy per bit; identifiability \\(\\min(1, d'/10)\\); randomness = fraction of applicable NIST tests passed. The index is their mean × 100. It is a navigation aid for comparing designs, not a standardised metric — report the individual metrics in publications.</p>`],
  ['python', 'Python package & CLI', `
<pre>pip install "git+https://github.com/TakMashhido/PUFAnalytics.git"

import pufanalytics as pa
ds = pa.simulate("arbiter", n_devices=32, n_bits=128, n_repeats=4, seed=2024,
                 conditions=[("25C", 1), ("-40C", 1.8), ("85C", 2.6)], stages=64, noise=0.06)
# or: ds = pa.PUFDataset.from_file("measurements.csv")
res = pa.analyze(ds, bootstrap=1000)
print(pa.to_markdown(res)); pa.to_latex(res, "table.tex")

# command line
pufanalytics simulate sram -o sram.csv --devices 50 --bits 256 --conditions 25C:1,85C:2.5
pufanalytics analyze sram.csv --markdown report.md --latex table.tex --json full.json
pufanalytics attack --stages 64 --xor 2

# Monte-Carlo sweep (identical to the Simulation studio)
res = pa.sweep("sram", "noise", [0.05, 0.1, 0.2], param2="n_bits", values2=[64, 128], seeds=5)
pufanalytics ecc --ber 0.08 --min-entropy 0.9 --key-bits 256 --target 1e-9</pre>
    <p>The original string-based API (<code>hamming_distance</code>, <code>uniqueness</code>, …) is still available for backward compatibility.</p>`],
  ['refs', 'References & citation', ''],
];

export function renderDocs(root, refs) {
  root.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
    <section class="card"><h2>Methods &amp; documentation</h2><p class="muted">Definitions, assumptions and references for every number shown in the application.</p>
      <div class="row">${SECTIONS.map(([id, t]) => `<a class="chip" href="#/docs/${id}" data-jump="${id}">${t}</a>`).join('')}</div></section>
    ${SECTIONS.map(([id, t, body]) => `<section class="card prose-wrap" id="doc-${id}"><h2>${t}</h2><div class="prose">${id === 'refs' ? `<ol class="ref-list">${refs.map((r) => `<li>${r}</li>`).join('')}</ol><h3>BibTeX</h3><pre>${BIB}</pre>` : body}</div></section>`).join('')}
  </div>`;
  $$('[data-jump]', root).forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); history.replaceState(null, '', `#/docs/${a.dataset.jump}`); document.getElementById(`doc-${a.dataset.jump}`).scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  // Deep links: #/docs/<section> (e.g. #/docs/metrics) open the page at that section.
  const target = (location.hash.match(/^#\/docs\/([\w-]+)/) || [])[1];
  if (target && document.getElementById(`doc-${target}`)) requestAnimationFrame(() => document.getElementById(`doc-${target}`).scrollIntoView({ block: 'start' }));
  loadKatex().then((k) => {
    if (!k || !root.isConnected) return;
    $$('.formula', root).forEach((el) => { try { k.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); } catch { /* keep raw */ } });
    $$('.prose p, .prose li', root).forEach((el) => {
      if (!el.innerHTML.includes('\\(')) return;
      el.innerHTML = el.innerHTML.replace(/\\\((.+?)\\\)/g, (m, tex) => { try { return k.renderToString(tex.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'), { throwOnError: false }); } catch { return m; } });
    });
    // Formulas change the layout; keep a deep-linked section in view.
    const settle = () => { if (target && root.isConnected) document.getElementById(`doc-${target}`)?.scrollIntoView({ block: 'start' }); };
    settle(); document.fonts?.ready.then(() => setTimeout(settle, 60));
  });
}
