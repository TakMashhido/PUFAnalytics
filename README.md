# PUFAnalytics

**A research-grade toolkit for evaluating Physically Unclonable Functions (PUFs).** It comes as a Python package and as an in-browser workbench, and the two give the same results.

[![CI](https://github.com/TakMashhido/PUFAnalytics/actions/workflows/ci.yml/badge.svg)](https://github.com/TakMashhido/PUFAnalytics/actions/workflows/ci.yml)
[![DOI](https://img.shields.io/badge/DOI-10.23919/apcc64555.2025.11279762-blue.svg)](https://doi.org/10.23919/apcc64555.2025.11279762)
[![License: MIT](https://img.shields.io/badge/License-MIT-6c5ce7.svg)](LICENSE)

**▶ Web app: [koustav.isroot.in/PUFAnalytics](https://koustav.isroot.in/PUFAnalytics/)**. It runs entirely in your browser, works offline, and never uploads your data.

PUFAnalytics turns raw PUF read-outs into the numbers a hardware-security paper needs:

- the standard quality metrics, with confidence intervals
- identification error rates
- statistical randomness and entropy assessments
- modelling-attack resistance
- the error-correction overhead of a secure key generator

You also get publication-ready figures and tables, and a script that reproduces every value.

---

## What makes it different

| | |
|---|---|
| **Statistically honest** | Every headline metric has a percentile-bootstrap confidence interval over devices. Identification rates are reported both empirically and from a binomial model whose tails are accurate below 10⁻³⁰⁰. NIST tests that lack enough data are flagged *not applicable* rather than returning meaningless p-values. |
| **Reproducible across languages** | The browser engine and the Python package share a portable xoshiro128** RNG and the same algorithms. A population simulated in the web app with seed *s* is **bit-identical** to `pa.simulate(..., seed=s)` in Python. An automated parity suite of more than 2,400 checks enforces this. |
| **Validated** | The NIST SP 800-22 implementations reproduce the worked examples of the standard to six decimals. The special functions and binomial tails are checked against SciPy. |
| **End to end** | It covers raw data → metrics → identification → randomness → attack → ECC sizing → LaTeX table, in one tool. |
| **Private** | The web app is static (GitHub Pages) and computes in a Web Worker. Datasets stay in your browser's IndexedDB. |

## Feature overview

| Area | Capabilities |
|---|---|
| **Data** | `devices × measurements × bits` model with operating-condition labels. Imports CSV/TXT (binary or hex, with or without header), JSON and NumPy `.npy`. Pre-processing: bit windows, dark-bit masking of unstable positions, device subsets. |
| **Quality metrics** (Maiti et al.) | Uniformity, bit-aliasing, uniqueness, reliability, steadiness, mean/worst BER, per-bit error rate, stable-bit ratio, BER per operating condition, Hamming-weight distribution; 95% bootstrap CIs. |
| **Identification** | Intra/inter fractional-HD distributions with binomial fits and χ² goodness of fit, decidability *d′*, empirical EER, binomial FAR/FRR with an optimal threshold *t\**, an interactive threshold explorer, DET curve, and the inter-device distance matrix. |
| **Randomness & entropy** | NIST SP 800-22: monobit, block frequency, runs, longest run, cumulative sums, approximate entropy, serial, and DFT (exact for any length via Bluestein). NIST SP 800-90B MCV and Markov min-entropy; per-bit Shannon/min-entropy; LZ76 complexity; bit-position correlation matrix; autocorrelation with a white-noise band. |
| **Simulators** | Arbiter and k-XOR Arbiter (additive delay model), ring-oscillator (process variation + systematic gradient, neighbour/disjoint pairing), SRAM (cell mismatch + bias), and an ideal PUF. Multi-condition noise scaling. |
| **Attack lab** | Ridge-regularised logistic regression (Newton/IRLS) on parity features, learning curves across XOR widths, and attacks on your own CRPs. |
| **Key generation** | A code-offset fuzzy-extractor planner: repetition ⊗ {BCH, Golay, Reed–Muller, Hamming}, key failure probability, helper-data leakage, residual entropy, and BER sensitivity. |
| **Reporting** | SVG/PNG/CSV for every chart; Markdown, LaTeX (booktabs) and JSON reports; an auto-written *methods* paragraph with references; a Python reproduction script; BibTeX; side-by-side comparison of datasets with radar charts. |

## Web application

The app lives in [`web/`](web/) and is plain HTML, CSS and ES modules, with no build step and no framework.

```bash
cd web && python -m http.server 8000
# open http://localhost:8000
```

### Deploying to `koustav.isroot.in/PUFAnalytics`

Deployment is automatic. On every push to `main` that touches `web/`, the workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs the parity test and publishes the app to the `gh-pages` branch, which GitHub Pages serves. You can also run it by hand from the **Actions** tab. If the site does not appear after the first deployment, open **Settings → Pages** and set the source to *Deploy from a branch* → `gh-pages` / root (a one-time step).

If the custom domain `koustav.isroot.in` is configured on the user site `TakMashhido.github.io` (its own **Settings → Pages → Custom domain**, plus a DNS `CNAME` record pointing to `takmashhido.github.io`), GitHub serves every project site under that domain automatically. This app then appears at **`https://koustav.isroot.in/PUFAnalytics/`**, and no `CNAME` file is needed in this repository. All asset paths are relative, so the app also works at `https://takmashhido.github.io/PUFAnalytics/` or from any sub-path.

## Python package

```bash
pip install "git+https://github.com/TakMashhido/PUFAnalytics.git"
# or, from a clone:
pip install -e ".[test]"
```

### Quick start

```python
import pufanalytics as pa

# Real data: CSV with device,measurement,condition,response (binary or hex)
ds = pa.PUFDataset.from_file("measurements.csv")

# ...or a reproducible synthetic population
ds = pa.simulate("arbiter", n_devices=32, n_bits=128, n_repeats=4, seed=2024,
                 conditions=[("25C", 1.0), ("-40C", 1.8), ("85C", 2.6)],
                 stages=64, xor=1, noise=0.06)

result = pa.analyze(ds, reference="first", bootstrap=1000, seed=12345)
print(pa.to_markdown(result))          # human-readable report
pa.to_latex(result, "puf_table.tex")   # booktabs table for your paper
pa.to_json(result, "puf_full.json")    # every number, per device and per bit
```

### Building blocks

```python
from pufanalytics import quality, stats, nist, estimators, attacks, ecc

quality.uniqueness(ds)                 # % (ideal 50)
quality.reliability(ds)                # % per device
quality.bit_flip_rate(ds)              # per-bit error rate → dark-bit masking
quality.condition_ber(ds)              # BER per operating corner
nist.run_all(ds.reference().ravel())   # SP 800-22 results
estimators.markov_min_entropy(ds.reference().ravel())
attacks.simulated_attack(stages=64, xor=2, train_sizes=(100, 1000, 10000))
ecc.plan_key_generation(ber=0.08, min_entropy=0.9, key_bits=256, target_failure=1e-9)
```

### Command line

```bash
pufanalytics simulate sram -o sram.csv --devices 50 --bits 256 --conditions 25C:1,85C:2.5 --param bias=0.1
pufanalytics analyze sram.csv --markdown report.md --latex table.tex --json full.json
pufanalytics nist sram.csv
pufanalytics attack --stages 64 --xor 2 --train-sizes 100,1000,10000
pufanalytics ecc --ber 0.08 --min-entropy 0.9 --key-bits 256 --target 1e-9
```

### Backward compatibility

The original string-based functions are unchanged: `hamming_distance`, `bit_error_rate`, `intra_puf_variation`, `inter_puf_variation`, `uniqueness`, `reliability`, `avalanche_effect`, `uniformity`, `bit_aliasing`, `correlation_coefficient`, `entropy`, `mutual_information` and `min_entropy`. See [`example.py`](example.py).

> **Note:** `uniqueness()` in versions before 2.0 returned twice the mean fractional inter-device Hamming distance. It now follows the standard definition (ideal value 0.5). See [CHANGELOG.md](CHANGELOG.md).

## Data format

```text
device,measurement,condition,response
chipA,0,25C,0xA3F1C29B7E4D0516
chipA,1,85C,0xA3F1C2997E4D0716
chipB,0,25C,0x5C0E3D64819BF2E9
```

The following layouts are also accepted:

- one response per line (one device each)
- `device,response`, where repeated device rows are re-measurements
- `device,measurement,response`
- whitespace-separated bits
- NumPy arrays of shape `(devices, bits)` or `(devices, measurements, bits)`

Measurement 0 of each device is its enrolment reference. Use `reference="majority"` to compare against the majority-vote golden response instead.

## Metric definitions

For *k* devices with *n*-bit reference responses *Rᵢ* and re-measurements *Rᵢ,ₜ*:

| Metric | Definition | Ideal |
|---|---|---|
| Uniformity | HW(*Rᵢ*) / *n* | 50% |
| Bit-aliasing | mean over devices of bit *l* | 50% per bit |
| Uniqueness | 2 / (*k*(*k*−1)) · Σᵢ<ⱼ HD(*Rᵢ*, *Rⱼ*) / *n* | 50% |
| Reliability | 1 − mean over *t* of HD(*Rᵢ*, *Rᵢ,ₜ*) / *n* | 100% |
| Steadiness | 1 + mean over *l* of log₂ max(*pᵢ,ₗ*, 1 − *pᵢ,ₗ*) | 100% |
| Decidability | \|μ_inter − μ_intra\| / √((σ²_inter + σ²_intra) / 2) | > 6 |

The **Methods & docs** page of the web app documents every estimator, assumption and reference in full.

## Testing

```bash
pytest -q                          # Python test-suite (NIST worked examples, SciPy cross-checks, ...)
python tests/make_golden.py        # regenerate reference values from Python
node web/tests/parity.test.mjs     # browser engine must reproduce them exactly
```

## Project layout

```text
pufanalytics/        Python package
  dataset.py         PUFDataset, parsing and export
  quality.py         population metrics
  stats.py           special functions, binomial model, identification statistics, bootstrap
  nist.py            NIST SP 800-22 tests
  estimators.py      SP 800-90B and LZ76 estimators
  simulators.py      PUF population simulators
  attacks.py         modelling attacks
  ecc.py             fuzzy-extractor planner
  report.py          analyze() + Markdown / LaTeX / JSON
  rng.py             portable xoshiro128** RNG
  cli.py             command-line interface
  metrics.py         original string-based API
web/                 static web application (GitHub Pages)
  js/core/           analysis engine (mirrors the Python package)
  js/                UI, SVG charts, reports
  tests/             cross-language parity test
tests/               pytest suite
```

## Citation

If PUFAnalytics supports your research, please cite the paper (IEEE APCC 2025):

> K. K. Mondal, A. Gupta and D. Das, "PUFAnalytics: Python Library for Comprehensive Evaluation and Analysis of PUFs," *2025 30th Asia-Pacific Conference on Communications (APCC)*, IEEE, 2025, pp. 1–6, doi: [10.23919/apcc64555.2025.11279762](https://doi.org/10.23919/apcc64555.2025.11279762).

```bibtex
@inproceedings{mondal2025pufanalytics,
  title = {PUFAnalytics: Python Library for Comprehensive Evaluation and Analysis of PUFs},
  url = {http://dx.doi.org/10.23919/apcc64555.2025.11279762},
  DOI = {10.23919/apcc64555.2025.11279762},
  booktitle = {2025 30th Asia-Pacific Conference on Communications (APCC)},
  publisher = {IEEE},
  author = {Mondal, Koustav Kumar and Gupta, Ashi and Das, Debasis},
  year = {2025},
  month = Nov,
  pages = {1–6}
}
```

## References

1. A. Maiti, V. Gunreddy, P. Schaumont, "A systematic method to evaluate and compare the performance of physical unclonable functions," *Embedded Systems Design with FPGAs*, Springer, 2013.
2. R. Maes, *Physically Unclonable Functions: Constructions, Properties and Applications*, Springer, 2013.
3. A. Rukhin et al., NIST SP 800-22 Rev. 1a, 2010.
4. M. S. Turan et al., NIST SP 800-90B, 2018.
5. U. Rührmair et al., "Modeling attacks on physical unclonable functions," ACM CCS, 2010.
6. C. Bösch et al., "Efficient helper data key extractor on FPGAs," CHES, 2008.
7. Y. Dodis, L. Reyzin, A. Smith, "Fuzzy extractors," EUROCRYPT, 2004.
8. J. Daugman, "The importance of being random: statistical principles of iris recognition," *Pattern Recognition*, 2003.
9. K. K. Mondal, A. Gupta, D. Das, "PUFAnalytics: Python Library for Comprehensive Evaluation and Analysis of PUFs," *2025 30th Asia-Pacific Conference on Communications (APCC)*, IEEE, 2025, pp. 1–6, doi: [10.23919/apcc64555.2025.11279762](https://doi.org/10.23919/apcc64555.2025.11279762).

## License

MIT © Koustav Kumar Mondal
