"""Statistical randomness tests from NIST SP 800-22 rev. 1a.

A. Rukhin et al., "A Statistical Test Suite for Random and Pseudorandom Number
Generators for Cryptographic Applications", NIST SP 800-22 rev. 1a, 2010.

Each test takes a sequence of bits (0/1) and returns a dictionary::

    {"name", "p_value", "p_values", "statistic", "passed", "n", "applicable",
     "note"}

Pass ``strict=False`` to bypass the minimum-length checks (used to reproduce
the worked examples of the standard).

``passed`` is ``p_value >= alpha`` (default alpha = 0.01, as recommended by
NIST).  Tests whose minimum input length is not met are reported with
``applicable=False`` instead of returning misleading p-values.

For PUFs, the tests are usually applied to the concatenation of the enrolled
responses of all devices, which probes both uniformity and inter-device
independence.
"""

import math

import numpy as np

from .stats import igamc, normal_cdf

__all__ = [
    "monobit",
    "block_frequency",
    "runs",
    "longest_run",
    "cumulative_sums",
    "approximate_entropy",
    "serial",
    "spectral",
    "run_all",
]


def _bits(seq):
    if isinstance(seq, str):
        return np.frombuffer(seq.encode("ascii"), dtype=np.uint8) - ord("0")
    return np.asarray(seq, dtype=np.uint8).ravel()


def _result(name, p_values, statistic, n, alpha, applicable=True, note=""):
    if not applicable:
        return {"name": name, "p_value": None, "p_values": [], "statistic": None, "passed": None,
                "n": int(n), "applicable": False, "note": note}
    p_values = [float(min(max(p, 0.0), 1.0)) for p in p_values]
    p = min(p_values)
    return {"name": name, "p_value": p, "p_values": p_values, "statistic": statistic,
            "passed": bool(p >= alpha), "n": int(n), "applicable": True, "note": note}


def monobit(seq, alpha=0.01, strict=True):
    """2.1 Frequency (monobit) test. Requires n >= 100."""
    x = _bits(seq)
    n = x.size
    if strict and n < 100:
        return _result("Frequency (monobit)", [], None, n, alpha, False, "requires n >= 100")
    s = abs(int(2 * x.sum()) - n) / math.sqrt(n)
    return _result("Frequency (monobit)", [math.erfc(s / math.sqrt(2))], s, n, alpha)


def block_frequency(seq, alpha=0.01, block_size=None, strict=True):
    """2.2 Frequency test within a block. Requires n >= 100."""
    x = _bits(seq)
    n = x.size
    if strict and n < 100:
        return _result("Block frequency", [], None, n, alpha, False, "requires n >= 100")
    m = block_size or max(20, min(128, n // 100))
    nb = n // m
    if nb < 1:
        return _result("Block frequency", [], None, n, alpha, False, "block larger than sequence")
    pi = x[: nb * m].reshape(nb, m).mean(axis=1)
    chi2 = 4.0 * m * float(np.sum((pi - 0.5) ** 2))
    return _result("Block frequency", [igamc(nb / 2.0, chi2 / 2.0)], chi2, n, alpha, note="M=%d" % m)


def runs(seq, alpha=0.01, strict=True):
    """2.3 Runs test. Requires n >= 100."""
    x = _bits(seq)
    n = x.size
    if strict and n < 100:
        return _result("Runs", [], None, n, alpha, False, "requires n >= 100")
    pi = x.mean()
    if abs(pi - 0.5) >= 2.0 / math.sqrt(n):
        return _result("Runs", [0.0], None, n, alpha, note="frequency pre-test failed")
    v = 1 + int(np.count_nonzero(x[1:] != x[:-1]))
    num = abs(v - 2.0 * n * pi * (1 - pi))
    den = 2.0 * math.sqrt(2.0 * n) * pi * (1 - pi)
    return _result("Runs", [math.erfc(num / den)], float(v), n, alpha)


_LR_TABLE = [
    # (min n, M, [class upper bounds], probabilities)
    (750000, 10000, [10, 11, 12, 13, 14, 15, 16], [0.0882, 0.2092, 0.2483, 0.1933, 0.1208, 0.0675, 0.0727]),
    (6272, 128, [4, 5, 6, 7, 8, 9], [0.1174, 0.2430, 0.2493, 0.1752, 0.1027, 0.1124]),
    (128, 8, [1, 2, 3, 4], [0.2148, 0.3672, 0.2305, 0.1875]),
]


def longest_run(seq, alpha=0.01, strict=True):
    """2.4 Test for the longest run of ones in a block. Requires n >= 128."""
    x = _bits(seq)
    n = x.size
    for min_n, m, bounds, probs in _LR_TABLE:
        if n >= min_n:
            break
    else:
        return _result("Longest run of ones", [], None, n, alpha, False, "requires n >= 128")
    nb = n // m
    blocks = x[: nb * m].reshape(nb, m)
    counts = np.zeros(len(bounds))
    for b in blocks:
        longest = run = 0
        for bit in b:
            run = run + 1 if bit else 0
            if run > longest:
                longest = run
        if longest <= bounds[0]:
            counts[0] += 1
        elif longest >= bounds[-1]:
            counts[-1] += 1
        else:
            counts[bounds.index(longest)] += 1
    probs = np.array(probs)
    chi2 = float(np.sum((counts - nb * probs) ** 2 / (nb * probs)))
    k = len(bounds) - 1
    return _result("Longest run of ones", [igamc(k / 2.0, chi2 / 2.0)], chi2, n, alpha, note="M=%d" % m)


def _cusum_p(n, z):
    if z == 0:
        return 1.0
    s1 = 0.0
    for k in range(math.trunc((-n / z + 1) / 4), math.trunc((n / z - 1) / 4) + 1):
        s1 += normal_cdf((4 * k + 1) * z / math.sqrt(n)) - normal_cdf((4 * k - 1) * z / math.sqrt(n))
    s2 = 0.0
    for k in range(math.trunc((-n / z - 3) / 4), math.trunc((n / z - 1) / 4) + 1):
        s2 += normal_cdf((4 * k + 3) * z / math.sqrt(n)) - normal_cdf((4 * k + 1) * z / math.sqrt(n))
    return 1.0 - s1 + s2


def cumulative_sums(seq, alpha=0.01, strict=True):
    """2.13 Cumulative sums (forward and backward). Requires n >= 100."""
    x = _bits(seq)
    n = x.size
    if strict and n < 100:
        return _result("Cumulative sums", [], None, n, alpha, False, "requires n >= 100")
    s = 2 * x.astype(np.int64) - 1
    zf = int(np.max(np.abs(np.cumsum(s))))
    zb = int(np.max(np.abs(np.cumsum(s[::-1]))))
    return _result("Cumulative sums", [_cusum_p(n, zf), _cusum_p(n, zb)], float(max(zf, zb)), n, alpha)


def _pattern_counts(x, m):
    n = x.size
    if m == 0:
        return np.array([n])
    ext = np.concatenate([x, x[: m - 1]]).astype(np.int64)
    idx = np.zeros(n, dtype=np.int64)
    for j in range(m):
        idx = (idx << 1) | ext[j: j + n]
    return np.bincount(idx, minlength=1 << m)


def approximate_entropy(seq, alpha=0.01, m=None, strict=True):
    """2.12 Approximate entropy test. Requires m < floor(log2 n) - 5."""
    x = _bits(seq)
    n = x.size
    if m is None:
        m = min(10, int(math.floor(math.log2(n))) - 6) if n > 1 else 0
    if (strict and n < 100) or m < 1:
        return _result("Approximate entropy", [], None, n, alpha, False, "sequence too short")

    def phi(mm):
        c = _pattern_counts(x, mm) / n
        c = c[c > 0]
        return float(np.sum(c * np.log(c)))

    apen = phi(m) - phi(m + 1)
    chi2 = 2.0 * n * (math.log(2) - apen)
    return _result("Approximate entropy", [igamc(2 ** (m - 1), chi2 / 2.0)], chi2, n, alpha, note="m=%d" % m)


def serial(seq, alpha=0.01, m=None, strict=True):
    """2.11 Serial test (two p-values). Requires m < floor(log2 n) - 2."""
    x = _bits(seq)
    n = x.size
    if m is None:
        m = min(16, int(math.floor(math.log2(n))) - 3) if n > 1 else 0
    if (strict and n < 100) or m < 3:
        return _result("Serial", [], None, n, alpha, False, "sequence too short")

    def psi2(mm):
        if mm <= 0:
            return 0.0
        c = _pattern_counts(x, mm).astype(float)
        return float((2 ** mm) / n * np.sum(c ** 2) - n)

    p0, p1, p2 = psi2(m), psi2(m - 1), psi2(m - 2)
    d1 = p0 - p1
    d2 = p0 - 2 * p1 + p2
    pv = [igamc(2 ** (m - 2), d1 / 2.0), igamc(2 ** (m - 3), d2 / 2.0)]
    return _result("Serial", pv, d1, n, alpha, note="m=%d" % m)


def spectral(seq, alpha=0.01, strict=True):
    """2.6 Discrete Fourier transform (spectral) test. Requires n >= 1000.

    The sequence is evaluated on its full length with an exact DFT
    (NumPy FFT supports arbitrary lengths).
    """
    x = _bits(seq)
    n = x.size
    if strict and n < 1000:
        return _result("Spectral (DFT)", [], None, n, alpha, False, "requires n >= 1000")
    s = 2.0 * x - 1.0
    mod = np.abs(np.fft.fft(s))[: n // 2]
    t = math.sqrt(math.log(1 / 0.05) * n)
    n0 = 0.95 * n / 2.0
    n1 = float(np.count_nonzero(mod < t))
    d = (n1 - n0) / math.sqrt(n * 0.95 * 0.05 / 4.0)
    return _result("Spectral (DFT)", [math.erfc(abs(d) / math.sqrt(2))], d, n, alpha)


_TESTS = [monobit, block_frequency, runs, longest_run, cumulative_sums, approximate_entropy, serial, spectral]


def run_all(seq, alpha=0.01, strict=True):
    """Run every implemented SP 800-22 test and return a list of results."""
    return [t(seq, alpha=alpha, strict=strict) for t in _TESTS]
