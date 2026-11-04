"""Population-level PUF quality metrics.

The definitions follow the standard evaluation framework of

    A. Maiti, V. Gunreddy, P. Schaumont, "A Systematic Method to Evaluate and
    Compare the Performance of Physical Unclonable Functions", in
    *Embedded Systems Design with FPGAs*, Springer, 2013.

and the notation of R. Maes, *Physically Unclonable Functions: Constructions,
Properties and Applications*, Springer, 2013.  All functions accept a
:class:`~pufanalytics.dataset.PUFDataset`, a NumPy array of shape
``(devices, bits)`` / ``(devices, measurements, bits)`` or a list of bit
strings, and are fully vectorised.

All percentages are returned on a 0-100 scale; fractional Hamming distances
(fHD) on a 0-1 scale.
"""

import numpy as np

from .dataset import PUFDataset

__all__ = [
    "as_dataset",
    "uniformity",
    "bit_aliasing",
    "inter_hd",
    "inter_hd_matrix",
    "uniqueness",
    "intra_hd",
    "reliability",
    "steadiness",
    "bit_flip_rate",
    "stable_bit_ratio",
    "condition_ber",
    "hamming_weights",
    "bit_correlation_matrix",
    "autocorrelation",
    "bit_entropy",
    "bit_min_entropy",
]


def as_dataset(data):
    """Coerce supported inputs into a :class:`PUFDataset`."""
    if isinstance(data, PUFDataset):
        return data
    if isinstance(data, np.ndarray):
        return PUFDataset(data)
    data = list(data)
    if data and isinstance(data[0], str):
        return PUFDataset.from_bitstrings(data)
    return PUFDataset(data)


def _ref(data, reference):
    ds = as_dataset(data)
    return ds, ds.reference(reference).astype(np.int64)


# ---------------------------------------------------------------- uniformity
def uniformity(data, reference="first"):
    """Uniformity (fraction of 1s, %) of each device's reference response. Ideal 50 %."""
    _, ref = _ref(data, reference)
    return ref.mean(axis=1) * 100.0


def bit_aliasing(data, reference="first"):
    """Bit-aliasing (%) per bit position across devices. Ideal 50 %."""
    _, ref = _ref(data, reference)
    return ref.mean(axis=0) * 100.0


# ---------------------------------------------------------------- uniqueness
def inter_hd_matrix(data, reference="first"):
    """Symmetric ``devices x devices`` matrix of inter-device Hamming distances."""
    _, ref = _ref(data, reference)
    a = ref
    # HD = sum(x) + sum(y) - 2 x.y
    w = a.sum(axis=1)
    return (w[:, None] + w[None, :] - 2 * (a @ a.T)).astype(np.int64)


def inter_hd(data, reference="first"):
    """All pairwise inter-device Hamming distances (integer), upper triangle."""
    m = inter_hd_matrix(data, reference)
    iu = np.triu_indices(m.shape[0], k=1)
    return m[iu]


def uniqueness(data, reference="first"):
    """Uniqueness: mean pairwise inter-device fHD in %. Ideal 50 %."""
    ds = as_dataset(data)
    if ds.n_devices < 2:
        raise ValueError("At least two devices are required for uniqueness")
    return float(inter_hd(ds, reference).mean() / ds.n_bits * 100.0)


# --------------------------------------------------------------- reliability
def intra_hd(data, reference="first"):
    """Intra-device Hamming distances between the reference and every re-measurement.

    Returns a list (one entry per device) of integer arrays.  With
    ``reference="first"`` measurement 0 is the reference and is excluded; with
    ``reference="majority"`` every measurement is compared to the golden
    response.
    """
    ds = as_dataset(data)
    out = []
    for d in ds.devices:
        if reference == "first":
            ref, rest = d[0], d[1:]
        else:
            ref = (2 * d.sum(axis=0) >= d.shape[0]).astype(np.uint8)
            rest = d
        out.append((rest != ref).sum(axis=1).astype(np.int64))
    return out


def reliability(data, reference="first"):
    """Reliability (%) per device: ``100 - mean intra fHD * 100``. Ideal 100 %.

    Devices with a single measurement yield ``nan``.
    """
    ds = as_dataset(data)
    res = []
    for hd in intra_hd(ds, reference):
        res.append(100.0 - hd.mean() / ds.n_bits * 100.0 if hd.size else float("nan"))
    return np.array(res)


def steadiness(data):
    """Steadiness (%) per device (Maiti et al.): ``100 (1 + mean_l log2 max(p_l, 1-p_l))``.

    ``p_l`` is the empirical probability of bit ``l`` being 1 over repeated
    measurements of the same device. Ideal 100 %.
    """
    ds = as_dataset(data)
    out = []
    for d in ds.devices:
        if d.shape[0] < 2:
            out.append(float("nan"))
            continue
        p = d.mean(axis=0)
        out.append(100.0 * (1.0 + np.mean(np.log2(np.maximum(p, 1.0 - p)))))
    return np.array(out)


def bit_flip_rate(data, reference="first"):
    """Per-bit error rate: probability that bit ``l`` differs from the reference.

    Averaged over all devices and re-measurements.  Useful to locate unstable
    cells and to design bit-masking / dark-bit schemes.
    """
    ds = as_dataset(data)
    errors = np.zeros(ds.n_bits)
    total = 0
    for d in ds.devices:
        if reference == "first":
            ref, rest = d[0], d[1:]
        else:
            ref = (2 * d.sum(axis=0) >= d.shape[0]).astype(np.uint8)
            rest = d
        errors += (rest != ref).sum(axis=0)
        total += rest.shape[0]
    return errors / total if total else np.full(ds.n_bits, np.nan)


def stable_bit_ratio(data):
    """Fraction of (device, bit) cells that never changed over all measurements."""
    ds = as_dataset(data)
    stable = 0
    cells = 0
    for d in ds.devices:
        if d.shape[0] < 2:
            continue
        stable += int(np.sum(np.all(d == d[0], axis=0)))
        cells += d.shape[1]
    return stable / cells if cells else float("nan")


def condition_ber(data):
    """Mean bit error rate w.r.t. the enrolment read-out, per operating condition.

    The enrolment read-out (measurement 0 of each device) is excluded.
    Returns ``{condition: {"ber": float, "n": int}}``.
    """
    ds = as_dataset(data)
    acc = {}
    for d, conds in zip(ds.devices, ds.conditions):
        ref = d[0]
        for m in range(1, d.shape[0]):
            e = acc.setdefault(conds[m], [0, 0])
            e[0] += int(np.sum(d[m] != ref))
            e[1] += 1
    return {c: {"ber": v[0] / (v[1] * ds.n_bits), "n": v[1]} for c, v in acc.items()}


def hamming_weights(data, reference="first"):
    """Hamming weight of every device's reference response."""
    _, ref = _ref(data, reference)
    return ref.sum(axis=1)


# --------------------------------------------------------------- correlation
def bit_correlation_matrix(data, reference="first", max_bits=256):
    """Pearson (phi) correlation between bit positions across devices.

    Constant bit positions produce ``nan`` rows/columns.  Only the first
    ``max_bits`` positions are considered to bound memory use.
    """
    _, ref = _ref(data, reference)
    x = ref[:, :max_bits].astype(float)
    x = x - x.mean(axis=0)
    sd = np.sqrt((x ** 2).sum(axis=0))
    with np.errstate(invalid="ignore", divide="ignore"):
        c = (x.T @ x) / np.outer(sd, sd)
    return c


def autocorrelation(data, reference="first", max_lag=32):
    """Mean normalised autocorrelation of the reference responses (±1 mapping).

    Returns an array for lags ``1..max_lag``.  Values near 0 indicate absence
    of spatial / sequential dependencies between neighbouring bits.
    """
    _, ref = _ref(data, reference)
    s = 2.0 * ref - 1.0
    n = s.shape[1]
    max_lag = int(min(max_lag, n - 1))
    out = np.zeros(max_lag)
    for lag in range(1, max_lag + 1):
        out[lag - 1] = np.mean(np.sum(s[:, :-lag] * s[:, lag:], axis=1) / (n - lag))
    return out


# ------------------------------------------------------------------- entropy
def bit_entropy(data, reference="first"):
    """Shannon entropy (bits) of every bit position across the device population."""
    _, ref = _ref(data, reference)
    p = ref.mean(axis=0)
    with np.errstate(divide="ignore", invalid="ignore"):
        h = -(np.where(p > 0, p * np.log2(p), 0.0) + np.where(p < 1, (1 - p) * np.log2(1 - p), 0.0))
    return h


def bit_min_entropy(data, reference="first"):
    """Min-entropy (bits) of every bit position across the device population."""
    _, ref = _ref(data, reference)
    p = ref.mean(axis=0)
    return -np.log2(np.maximum(p, 1.0 - p))


def tmv_ber(data, votes=(1, 3, 5, 7, 9, 11, 13, 15)):
    """Bit error rate after temporal majority voting (TMV) over ``m`` read-outs.

    Each cell's flip probability ``p`` is estimated against the device's
    majority-vote golden response; with ``m`` independent votes the residual
    error is ``P[Binomial(m, p) > m/2]``, averaged over all cells.  Returns
    ``{"votes": [...], "ber": [...]}``.
    """
    from .stats import binom_sf

    ds = as_dataset(data)
    ps = []
    for d in ds.devices:
        if d.shape[0] < 2:
            continue
        g = (2 * d.sum(axis=0) >= d.shape[0]).astype(np.uint8)
        ps.append((d != g).mean(axis=0))
    if not ps:
        return {"votes": list(votes), "ber": [float("nan")] * len(votes)}
    p = np.round(np.concatenate(ps), 12)
    vals, counts = np.unique(p, return_counts=True)
    out = []
    for m in votes:
        m = int(m)
        if m <= 1:
            out.append(float(np.sum(vals * counts) / counts.sum()))
        else:
            out.append(float(sum(c * binom_sf(m // 2, m, float(v)) for v, c in zip(vals, counts)) / counts.sum()))
    return {"votes": [int(m) for m in votes], "ber": out}
