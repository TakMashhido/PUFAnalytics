"""Monte-Carlo parameter sweeps over the PUF simulators.

:func:`sweep` evaluates :func:`quick_metrics` on simulated populations while
one or two parameters vary, repeating every grid point with several seeds
(common random numbers: replicate ``r`` uses seed ``seed + r`` at every grid
point, which reduces the variance of differences between points).  The web
application's *Simulation studio* runs the identical computation.
"""

import math

import numpy as np

from . import quality as Q
from . import stats as S
from .simulators import simulate

__all__ = ["quick_metrics", "sweep", "METRICS", "BASE_PARAMS"]

#: Metrics reported by :func:`quick_metrics` (key, label).
METRICS = [
    ("uniformity", "Uniformity (%)"),
    ("bit_aliasing_std", "Bit-aliasing σ (%)"),
    ("uniqueness", "Uniqueness (%)"),
    ("reliability", "Reliability (%)"),
    ("min_entropy", "Min-entropy / bit"),
    ("decidability", "Decidability d'"),
    ("log10_error", "log10 identification error"),
]

#: Population-level parameters that can be swept for every model.
BASE_PARAMS = ("n_devices", "n_bits", "n_repeats")


def quick_metrics(ds):
    """Fast headline metrics (no bootstrap, no NIST) used by sweeps."""
    n = ds.n_bits
    ref = ds.reference("first").astype(np.int64)
    out = {k: float("nan") for k, _ in METRICS}
    out["uniformity"] = float(ref.mean() * 100)
    out["bit_aliasing_std"] = float(np.std(ref.mean(axis=0) * 100, ddof=1)) if n > 1 else float("nan")
    p = ref.mean(axis=0)
    out["min_entropy"] = float(np.mean(-np.log2(np.maximum(p, 1 - p))))
    inter = Q.inter_hd(ds) if ds.n_devices > 1 else np.array([])
    if inter.size:
        out["uniqueness"] = float(inter.mean() / n * 100)
    intra_l = Q.intra_hd(ds)
    intra = np.concatenate(intra_l) if intra_l else np.array([])
    if intra.size:
        out["reliability"] = float(100 - intra.mean() / n * 100)
    if intra.size and inter.size:
        out["decidability"] = S.decidability(intra / n, inter / n)
        m = S.binomial_far_frr(n, max(float(intra.mean() / n), 1e-12), float(inter.mean() / n))
        err = max(m["far_at_threshold"], m["frr_at_threshold"])
        out["log10_error"] = float(math.log10(max(err, 1e-300)))
    return out


def _grid_values(spec):
    return [float(v) for v in spec]


def sweep(model="arbiter", param="noise", values=(0.01, 0.05, 0.1), param2=None, values2=None, seeds=5, seed=1,
          n_devices=20, n_bits=128, n_repeats=4, conditions=None, **params):
    """Sweep one (or two) simulator parameters.

    Returns a dict with ``values``/``values2`` and, for every metric key,
    ``mean`` and ``std`` arrays of shape ``(len(values2) or 1, len(values))``.
    """
    v1 = _grid_values(values)
    v2 = _grid_values(values2) if param2 else [None]
    keys = [k for k, _ in METRICS]
    mean = {k: np.full((len(v2), len(v1)), np.nan) for k in keys}
    std = {k: np.full((len(v2), len(v1)), np.nan) for k in keys}
    for j, b in enumerate(v2):
        for i, a in enumerate(v1):
            reps = {k: [] for k in keys}
            for r in range(int(seeds)):
                cfg = dict(n_devices=n_devices, n_bits=n_bits, n_repeats=n_repeats)
                kw = dict(params)
                for name, val in ((param, a), (param2, b)):
                    if name is None:
                        continue
                    if name in BASE_PARAMS:
                        cfg[name] = int(math.floor(val + 0.5))
                    elif name in ("stages", "xor", "loops", "x", "y"):
                        kw[name] = int(math.floor(val + 0.5))
                    else:
                        kw[name] = val
                ds = simulate(model, seed=int(seed) + r, conditions=conditions, **cfg, **kw)
                for k, v in quick_metrics(ds).items():
                    reps[k].append(v)
            for k in keys:
                x = np.array(reps[k], dtype=float)
                x = x[~np.isnan(x)]
                if x.size:
                    mean[k][j, i] = x.mean()
                    std[k][j, i] = x.std(ddof=1) if x.size > 1 else 0.0
    return {"model": model, "param": param, "values": v1, "param2": param2, "values2": v2 if param2 else None,
            "seeds": int(seeds), "seed": int(seed), "mean": mean, "std": std}
