# Changelog

## 2.1.0 — 2026-11-04

### Added
- **Figure studio** (web): 18 publication figures per dataset, including violin and box plots, empirical CDFs, a Q-Q plot against the binomial model, ROC, identification error vs response length, temporal majority voting, a bit-stability profile, polar bit-aliasing, entropy accumulation and scatter plots with fits. It also has interactive 3D surface, bar and scatter charts (drag to rotate, export the current view). Every figure can be downloaded as SVG + PNG + CSV in a single zip.
- **Simulation studio** (web) and `pa.sweep()`: Monte-Carlo sweeps of one or two parameters with confidence bands and 3D response surfaces.
- New simulators: Feed-forward Arbiter PUF, (x, y)-Interpose PUF and DRAM retention PUF, bit-identical in Python and the browser.
- Attack lab: attacks on Feed-forward and Interpose PUFs, and a 3D learnability landscape.
- Key generation: a 3D key-failure landscape over BER × repetition.
- `quality.tmv_ber()` and `stats.identification_vs_length()`.
- Box, violin, strip, error-bar and polar charts in the chart engine; a dependency-free 3D SVG renderer; a zip writer.

## 2.0.0 — 2026-11-03

### Added
- **Web workbench** (`web/`): an in-browser application with a claymorphism UI. It runs fully client-side, deploys to GitHub Pages, works offline, and offers ten views: overview, data & simulation, quality metrics, identification, randomness & entropy, attack lab, key generation, compare, report & export, and methods.
- `PUFDataset`: a devices × measurements × bits container with operating-condition labels. It imports CSV/TXT (binary or hex), JSON and NumPy, and exports CSV/JSON.
- `quality`: vectorised metrics following Maiti et al. (uniformity, bit-aliasing, uniqueness, reliability, steadiness, per-bit error rate, stable-bit ratio, per-condition BER, bit correlation, autocorrelation, per-bit entropy).
- `stats`: identification statistics (decidability d', empirical FAR/FRR/EER, binomial FAR/FRR with log-space tails, binomial goodness of fit) and percentile-bootstrap confidence intervals.
- `nist`: eight NIST SP 800-22 tests, validated against the worked examples of the standard.
- `estimators`: the SP 800-90B MCV and Markov min-entropy estimates, and normalised LZ76 complexity.
- `simulators`: Arbiter / k-XOR Arbiter, ring-oscillator, SRAM and ideal PUF populations with environmental conditions.
- `rng.PortableRNG`: a xoshiro128** generator shared bit-for-bit with the web app, so the same seed produces the same population in Python and in the browser.
- `attacks`: a logistic-regression modelling attack with learning curves, on simulated or user-supplied CRPs.
- `ecc`: a fuzzy-extractor planner covering repetition + BCH/Golay/Reed–Muller/Hamming codes.
- `report`: `analyze()` with Markdown, LaTeX and JSON output.
- The `pufanalytics` command-line tool (`analyze`, `simulate`, `nist`, `attack`, `ecc`).
- A cross-language parity test suite, plus CI and Pages workflows.

### Fixed
- `uniqueness()` returned twice the mean fractional inter-device Hamming distance; it now matches the standard definition (ideal 0.5).
- Corrected docstrings of `inter_puf_variation`, `avalanche_effect` and `correlation_coefficient`.
- Corrected the author name order in `CITATION.cff`.
- Citation and DOI now point to the IEEE APCC 2025 paper (doi:10.23919/apcc64555.2025.11279762) in the README, `CITATION.cff` and the web app.

### Changed
- Packaging moved from `setup.py` to `pyproject.toml`; NumPy is now a dependency (Python ≥ 3.8).
