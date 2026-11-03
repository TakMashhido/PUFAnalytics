"""Entropy estimators for PUF response streams.

* :func:`shannon_entropy_rate` -- empirical Shannon entropy per bit.
* :func:`mcv_min_entropy` -- NIST SP 800-90B, sec. 6.3.1 *Most Common Value*
  estimate (with the 99 % upper confidence bound).
* :func:`markov_min_entropy` -- NIST SP 800-90B, sec. 6.3.3 *Markov* estimate
  for binary sources (captures first-order dependencies between bits).
* :func:`lz_complexity` -- normalised Lempel-Ziv (1976) complexity, an
  estimator of algorithmic randomness that is sensitive to repeating patterns.
* :func:`population_entropy` -- per-position Shannon / min-entropy summary
  across a population of devices.
"""

import math

import numpy as np

from .quality import bit_entropy, bit_min_entropy

__all__ = [
    "shannon_entropy_rate",
    "mcv_min_entropy",
    "markov_min_entropy",
    "lz_complexity",
    "population_entropy",
]


def _bits(seq):
    if isinstance(seq, str):
        return np.frombuffer(seq.encode("ascii"), dtype=np.uint8) - ord("0")
    return np.asarray(seq, dtype=np.uint8).ravel()


def shannon_entropy_rate(seq):
    """Shannon entropy (bits per bit) of the empirical 0/1 distribution."""
    x = _bits(seq)
    if x.size == 0:
        return float("nan")
    p = x.mean()
    if p in (0.0, 1.0):
        return 0.0
    return float(-(p * math.log2(p) + (1 - p) * math.log2(1 - p)))


def mcv_min_entropy(seq):
    """SP 800-90B Most Common Value min-entropy estimate (bits per bit)."""
    x = _bits(seq)
    n = x.size
    if n < 2:
        return float("nan")
    p_hat = max(x.sum(), n - x.sum()) / n
    p_u = min(1.0, p_hat + 2.576 * math.sqrt(p_hat * (1 - p_hat) / (n - 1)))
    return float(-math.log2(p_u))


def markov_min_entropy(seq, length=128):
    """SP 800-90B Markov min-entropy estimate for binary data (bits per bit)."""
    x = _bits(seq).astype(np.int64)
    n = x.size
    if n < 3:
        return float("nan")
    p1 = x.mean()
    p = [1 - p1, p1]
    pairs = x[:-1] * 2 + x[1:]
    c = np.bincount(pairs, minlength=4).astype(float)
    t = [[0.0, 0.0], [0.0, 0.0]]
    for a in (0, 1):
        tot = c[2 * a] + c[2 * a + 1]
        for b in (0, 1):
            t[a][b] = c[2 * a + b] / tot if tot > 0 else 0.0

    def lg(v):
        return math.log2(v) if v > 0 else -math.inf

    best = [lg(p[0]), lg(p[1])]
    for _ in range(length - 1):
        best = [max(best[0] + lg(t[0][b]), best[1] + lg(t[1][b])) for b in (0, 1)]
    pmax = max(best)
    return float(min(-pmax / length, 1.0))


def lz_complexity(seq):
    """Normalised Lempel-Ziv (1976) complexity ``c(n) log2(n) / n``.

    Close to 1 for random sequences, close to 0 for highly regular ones.
    Uses the Kaspar-Schuster algorithm (O(n^2) worst case).
    """
    s = _bits(seq).tolist()
    n = len(s)
    if n < 2:
        return float("nan")
    c, l, i, k, k_max = 1, 1, 0, 1, 1
    while True:
        if s[i + k - 1] == s[l + k - 1]:
            k += 1
            if l + k > n:
                c += 1
                break
        else:
            if k > k_max:
                k_max = k
            i += 1
            if i == l:
                c += 1
                l += k_max
                if l + 1 > n:
                    break
                i, k, k_max = 0, 1, 1
            else:
                k = 1
    return float(c * math.log2(n) / n)


def population_entropy(data, reference="first"):
    """Summary of per-position entropy across a device population."""
    h = bit_entropy(data, reference)
    hmin = bit_min_entropy(data, reference)
    return {
        "shannon_per_bit": h,
        "min_entropy_per_bit": hmin,
        "shannon_mean": float(np.mean(h)),
        "min_entropy_mean": float(np.mean(hmin)),
        "shannon_total": float(np.sum(h)),
        "min_entropy_total": float(np.sum(hmin)),
    }
