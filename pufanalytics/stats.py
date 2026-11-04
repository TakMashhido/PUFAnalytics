"""Statistical utilities used throughout PUFAnalytics.

Everything here is implemented with the Python standard library and NumPy so
that the package carries no SciPy dependency.  The special functions are
validated against SciPy in the test-suite to ~1e-12 relative accuracy.
"""

import math

import numpy as np

from .rng import PortableRNG

__all__ = [
    "igam",
    "igamc",
    "normal_cdf",
    "binom_logpmf",
    "binom_cdf",
    "binom_sf",
    "binom_pmf_vector",
    "decidability",
    "far_frr_curve",
    "equal_error_rate",
    "binomial_far_frr",
    "binomial_fit",
    "percentile_ci",
    "histogram_counts",
]

_EPS = 1e-15
_FPMIN = 1e-300


# ---------------------------------------------------------------------------
# Special functions
# ---------------------------------------------------------------------------
def _gser(a, x):
    """Series representation of the regularised lower incomplete gamma P(a,x)."""
    gln = math.lgamma(a)
    ap = a
    total = delta = 1.0 / a
    for _ in range(10000):
        ap += 1.0
        delta *= x / ap
        total += delta
        if abs(delta) < abs(total) * _EPS:
            break
    return total * math.exp(-x + a * math.log(x) - gln)


def _gcf(a, x):
    """Continued fraction for the regularised upper incomplete gamma Q(a,x)."""
    gln = math.lgamma(a)
    b = x + 1.0 - a
    c = 1.0 / _FPMIN
    d = 1.0 / b
    h = d
    for i in range(1, 10000):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = b + an / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < _EPS:
            break
    return math.exp(-x + a * math.log(x) - gln) * h


def igam(a, x):
    """Regularised lower incomplete gamma function P(a, x)."""
    if x <= 0:
        return 0.0
    if x < a + 1.0:
        return _gser(a, x)
    return 1.0 - _gcf(a, x)


def igamc(a, x):
    """Regularised upper incomplete gamma function Q(a, x) = 1 - P(a, x).

    This is the ``igamc`` function used by NIST SP 800-22 to convert
    chi-square statistics into p-values.
    """
    if x <= 0:
        return 1.0
    if x < a + 1.0:
        return 1.0 - _gser(a, x)
    return _gcf(a, x)


def normal_cdf(x):
    """Standard normal cumulative distribution function."""
    return 0.5 * math.erfc(-x / math.sqrt(2.0))


# ---------------------------------------------------------------------------
# Binomial distribution
# ---------------------------------------------------------------------------
def binom_logpmf(k, n, p):
    """Natural log of the binomial probability mass function."""
    if k < 0 or k > n:
        return -math.inf
    if p <= 0.0:
        return 0.0 if k == 0 else -math.inf
    if p >= 1.0:
        return 0.0 if k == n else -math.inf
    return (
        math.lgamma(n + 1)
        - math.lgamma(k + 1)
        - math.lgamma(n - k + 1)
        + k * math.log(p)
        + (n - k) * math.log1p(-p)
    )


def binom_pmf_vector(n, p):
    """Return the binomial pmf for k = 0..n as a NumPy array."""
    return np.array([math.exp(binom_logpmf(k, n, p)) for k in range(n + 1)])


def _logsumexp(values):
    values = [v for v in values if v != -math.inf]
    if not values:
        return -math.inf
    m = max(values)
    return m + math.log(sum(math.exp(v - m) for v in values))


def binom_cdf(k, n, p):
    """P(X <= k) for X ~ Binomial(n, p), accurate deep into the tails."""
    if k < 0:
        return 0.0
    if k >= n:
        return 1.0
    lower = _logsumexp([binom_logpmf(i, n, p) for i in range(0, k + 1)])
    upper = _logsumexp([binom_logpmf(i, n, p) for i in range(k + 1, n + 1)])
    # compute whichever tail is smaller directly to retain precision
    if lower < upper:
        return math.exp(lower)
    return -math.expm1(upper)


def binom_sf(k, n, p):
    """P(X > k) for X ~ Binomial(n, p), accurate deep into the tails."""
    if k < 0:
        return 1.0
    if k >= n:
        return 0.0
    upper = _logsumexp([binom_logpmf(i, n, p) for i in range(k + 1, n + 1)])
    lower = _logsumexp([binom_logpmf(i, n, p) for i in range(0, k + 1)])
    if upper < lower:
        return math.exp(upper)
    return -math.expm1(lower)


# ---------------------------------------------------------------------------
# Identification / authentication statistics
# ---------------------------------------------------------------------------
def decidability(intra, inter):
    """Decidability index d' (Daugman) between intra- and inter-distance sets.

    ``d' = |mu_inter - mu_intra| / sqrt((var_inter + var_intra) / 2)``.
    Values above ~6 indicate practically error-free identification.
    """
    intra = np.asarray(intra, dtype=float)
    inter = np.asarray(inter, dtype=float)
    if intra.size == 0 or inter.size == 0:
        return float("nan")
    denom = math.sqrt((intra.var() + inter.var()) / 2.0)
    if denom == 0:
        return float("inf") if inter.mean() != intra.mean() else float("nan")
    return float(abs(inter.mean() - intra.mean()) / denom)


def histogram_counts(hd_values, n_bits):
    """Histogram of integer Hamming distances on the support 0..n_bits."""
    hd_values = np.asarray(hd_values, dtype=np.int64)
    return np.bincount(hd_values, minlength=n_bits + 1)[: n_bits + 1]


def far_frr_curve(intra_hd, inter_hd, n_bits):
    """Empirical FAR / FRR as a function of the HD acceptance threshold.

    A response is *accepted* when its Hamming distance to the enrolled
    reference is ``<= t``.

    Returns
    -------
    dict with ``thresholds`` (0..n_bits), ``far`` and ``frr`` arrays.
    """
    intra_c = histogram_counts(intra_hd, n_bits).astype(float)
    inter_c = histogram_counts(inter_hd, n_bits).astype(float)
    t = np.arange(n_bits + 1)
    if intra_c.sum() > 0:
        frr = 1.0 - np.cumsum(intra_c) / intra_c.sum()
    else:
        frr = np.full(n_bits + 1, np.nan)
    if inter_c.sum() > 0:
        far = np.cumsum(inter_c) / inter_c.sum()
    else:
        far = np.full(n_bits + 1, np.nan)
    return {"thresholds": t, "far": far, "frr": np.clip(frr, 0.0, 1.0)}


def equal_error_rate(far, frr):
    """Equal error rate and the threshold index where it is attained.

    The EER is taken at the threshold that minimises ``max(FAR, FRR)``.
    """
    far = np.asarray(far, dtype=float)
    frr = np.asarray(frr, dtype=float)
    if np.all(np.isnan(far)) or np.all(np.isnan(frr)):
        return float("nan"), -1
    worst = np.maximum(far, frr)
    idx = int(np.nanargmin(worst))
    return float((far[idx] + frr[idx]) / 2.0), idx


def binomial_fit(hd_values, n_bits):
    """Fit a binomial model ``Binomial(n_bits, p)`` to Hamming distances.

    Returns ``p`` (maximum-likelihood estimate) and the chi-square-style
    goodness-of-fit statistic sum((O-E)^2/E) over bins with E >= 5.
    """
    hd = np.asarray(hd_values, dtype=float)
    if hd.size == 0:
        return {"p": float("nan"), "chi2": float("nan"), "dof": 0}
    p = float(hd.mean() / n_bits)
    observed = histogram_counts(hd.astype(np.int64), n_bits).astype(float)
    expected = binom_pmf_vector(n_bits, p) * hd.size
    mask = expected >= 5
    chi2 = float(np.sum((observed[mask] - expected[mask]) ** 2 / expected[mask])) if mask.any() else float("nan")
    dof = int(max(mask.sum() - 2, 0))
    pval = igamc(dof / 2.0, chi2 / 2.0) if dof > 0 and not math.isnan(chi2) else float("nan")
    return {"p": p, "chi2": chi2, "dof": dof, "p_value": pval}


def _log_tails(n, p):
    """log P(X <= t) and log P(X > t) for t = 0..n (vectorised, O(n))."""
    lp = np.array([binom_logpmf(k, n, p) for k in range(n + 1)])
    lo = np.logaddexp.accumulate(lp)
    hi = np.empty(n + 1)
    hi[:-1] = np.logaddexp.accumulate(lp[::-1])[::-1][1:]
    hi[-1] = -np.inf
    return lo, hi


def binomial_far_frr(n_bits, p_intra, p_inter):
    """FAR / FRR under the independent-bit binomial model.

    Returns a dict with the curves and the optimal threshold ``t*`` that
    minimises ``max(FAR, FRR)`` together with the attained error rates.  These
    extrapolated curves allow error rates far below 1/sample-count to be
    estimated (e.g. 1e-9), as is standard in PUF key-generation literature.
    """
    t = np.arange(n_bits + 1)
    a_lo, a_hi = _log_tails(n_bits, p_inter)
    r_lo, r_hi = _log_tails(n_bits, p_intra)
    with np.errstate(over="ignore", invalid="ignore"):
        far = np.where(a_lo < a_hi, np.exp(a_lo), -np.expm1(a_hi))
        frr = np.where(r_hi < r_lo, np.exp(r_hi), -np.expm1(r_lo))
    far[-1], frr[-1] = 1.0, 0.0
    idx = int(np.argmin(np.maximum(far, frr)))
    return {
        "thresholds": t,
        "far": far,
        "frr": frr,
        "threshold": idx,
        "far_at_threshold": float(far[idx]),
        "frr_at_threshold": float(frr[idx]),
    }


# ---------------------------------------------------------------------------
# Resampling
# ---------------------------------------------------------------------------
def percentile_ci(samples, alpha=0.05):
    """Two-sided percentile confidence interval of bootstrap replicates."""
    samples = np.asarray(samples, dtype=float)
    samples = samples[~np.isnan(samples)]
    if samples.size == 0:
        return (float("nan"), float("nan"))
    lo = float(np.quantile(samples, alpha / 2.0))
    hi = float(np.quantile(samples, 1.0 - alpha / 2.0))
    return (lo, hi)


def bootstrap_indices(n, n_resamples, seed=0):
    """Generate bootstrap index sets with the portable RNG (reproducible)."""
    rng = PortableRNG(seed)
    out = np.empty((n_resamples, n), dtype=np.int64)
    for b in range(n_resamples):
        for i in range(n):
            out[b, i] = rng.randint(n)
    return out


def identification_vs_length(p_intra, p_inter, lengths):
    """Binomial-model identification error ``min_t max(FAR, FRR)`` for each response length."""
    out = []
    for n in lengths:
        m = binomial_far_frr(int(n), max(p_intra, 1e-12), p_inter)
        out.append(max(m["far_at_threshold"], m["frr_at_threshold"]))
    return {"lengths": [int(n) for n in lengths], "error": out}
