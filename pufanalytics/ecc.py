"""Error-correction and secure-key-generation planning.

A PUF response is noisy, so key generation uses a *fuzzy extractor*: an error
correcting code (ECC) removes the noise using public helper data, and a hash
compresses the remaining entropy into a key.  This module estimates, for a
measured bit error rate ``p`` and min-entropy ``h`` per bit, how many PUF bits
a given code construction needs to derive a ``key_bits`` key with failure
probability below a target.

Model (code-offset construction, e.g. Bösch et al., CHES 2008; Maes, 2013):

* an inner repetition code ``(r, 1)`` with majority decoding (optional)
  followed by an outer block code ``(n, k, t)`` correcting ``t`` errors;
* bit errors are independent with probability ``p``;
* block failure ``P_b = P[Binomial(n, p_in) > t]`` where ``p_in`` is the
  residual error rate after repetition decoding;
* key failure ``1 - (1 - P_b)^B`` for ``B`` blocks;
* helper-data leakage per block ``n*r - k`` bits, so residual entropy per block
  is ``n*r*h - (n*r - k)``; the number of blocks is chosen such that
  ``B * residual >= key_bits``.
"""

import math

from .stats import binom_sf

__all__ = ["CODES", "repetition_error", "block_failure", "plan_key_generation"]

#: Catalogue of outer codes as (name, n, k, t).
CODES = [
    ("None", 1, 1, 0),
    ("Hamming(7,4,1)", 7, 4, 1),
    ("Golay(23,12,3)", 23, 12, 3),
    ("Golay(24,12,3)", 24, 12, 3),
    ("RM(1,4)", 16, 5, 3),
    ("RM(1,5)", 32, 6, 7),
    ("RM(1,6)", 64, 7, 15),
    ("RM(1,7)", 128, 8, 31),
    ("BCH(15,7,2)", 15, 7, 2),
    ("BCH(31,16,3)", 31, 16, 3),
    ("BCH(63,30,6)", 63, 30, 6),
    ("BCH(63,16,11)", 63, 16, 11),
    ("BCH(127,64,10)", 127, 64, 10),
    ("BCH(127,36,15)", 127, 36, 15),
    ("BCH(255,131,18)", 255, 131, 18),
    ("BCH(255,63,30)", 255, 63, 30),
    ("BCH(255,21,55)", 255, 21, 55),
]

REPETITIONS = [1, 3, 5, 7, 9, 11, 15]


def repetition_error(p, r):
    """Residual bit error after majority decoding of an ``(r,1)`` repetition code."""
    if r <= 1:
        return p
    return binom_sf(r // 2, r, p)


def block_failure(p, n, t):
    """Probability that a block of ``n`` bits has more than ``t`` errors."""
    return binom_sf(t, n, p)


def plan_key_generation(ber, min_entropy=1.0, key_bits=128, target_failure=1e-6, codes=None,
                        repetitions=None):
    """Enumerate ECC configurations and report the feasible ones.

    Returns a list of dicts sorted by the number of PUF bits required, each
    with ``code``, ``repetition``, ``blocks``, ``puf_bits``, ``helper_bits``,
    ``failure``, ``feasible``.
    """
    codes = codes or CODES
    repetitions = repetitions or REPETITIONS
    out = []
    for name, n, k, t in codes:
        for r in repetitions:
            p_in = repetition_error(ber, r)
            pb = block_failure(p_in, n, t)
            bits_per_block = n * r
            residual = bits_per_block * min_entropy - (bits_per_block - k)
            if residual <= 0:
                out.append({"code": name, "n": n, "k": k, "t": t, "repetition": r, "blocks": None,
                            "puf_bits": None, "helper_bits": None, "failure": None, "feasible": False,
                            "reason": "helper data leaks all entropy"})
                continue
            blocks = int(math.ceil(key_bits / residual))
            if pb <= 0:
                fail = 0.0
            else:
                fail = -math.expm1(blocks * math.log1p(-pb)) if pb < 1 else 1.0
            out.append({
                "code": name, "n": n, "k": k, "t": t, "repetition": r,
                "blocks": blocks,
                "puf_bits": blocks * bits_per_block,
                "helper_bits": blocks * (bits_per_block - k),
                "residual_entropy": blocks * residual,
                "inner_ber": p_in,
                "block_failure": pb,
                "failure": fail,
                "feasible": fail <= target_failure,
                "reason": "" if fail <= target_failure else "failure rate above target",
            })
    out.sort(key=lambda e: (not e["feasible"], e["puf_bits"] if e["puf_bits"] is not None else math.inf))
    return out
