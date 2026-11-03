"""Portable, seedable pseudo-random number generator.

PUFAnalytics ships the *same* generator in Python and in the browser
(``web/js/core/rng.js``).  Given the same seed, both implementations produce
an identical stream of numbers, so a synthetic PUF population generated in the
web application can be regenerated bit-for-bit from a Python script.  This is
what makes simulations reported in a paper reproducible by anyone.

Algorithm
---------
* State seeding: SplitMix32.
* Generator: xoshiro128** (Blackman & Vigna, 2018), period 2**128 - 1.
* Uniform doubles in [0, 1): ``next_u32() / 2**32``.
* Standard normal variates: Box-Muller transform (cosine branch only, so every
  normal consumes exactly two uniforms and the stream layout is trivial to
  mirror in other languages).
"""

import math

_MASK = 0xFFFFFFFF
_TWO32 = 4294967296.0

__all__ = ["PortableRNG"]


def _rotl(x, k):
    return ((x << k) | (x >> (32 - k))) & _MASK


class PortableRNG:
    """xoshiro128** generator with a SplitMix32 seeder.

    Parameters
    ----------
    seed : int
        Any integer; only the low 32 bits are used.
    """

    def __init__(self, seed=0):
        self.seed = int(seed) & _MASK
        sm = self.seed
        state = []
        for _ in range(4):
            sm = (sm + 0x9E3779B9) & _MASK
            z = sm
            z = ((z ^ (z >> 16)) * 0x21F0AAAD) & _MASK
            z = ((z ^ (z >> 15)) * 0x735A2D97) & _MASK
            z = z ^ (z >> 15)
            state.append(z)
        if not any(state):  # the all-zero state is invalid for xoshiro
            state[0] = 1
        self._s = state

    # ------------------------------------------------------------------ core
    def next_u32(self):
        """Return the next unsigned 32-bit integer."""
        s0, s1, s2, s3 = self._s
        result = (_rotl((s1 * 5) & _MASK, 7) * 9) & _MASK
        t = (s1 << 9) & _MASK
        s2 ^= s0
        s3 ^= s1
        s1 ^= s2
        s0 ^= s3
        s2 ^= t
        s3 = _rotl(s3, 11)
        self._s = [s0, s1, s2, s3]
        return result

    def random(self):
        """Uniform double in [0, 1)."""
        return self.next_u32() / _TWO32

    def bit(self):
        """A single fair random bit (the most significant bit of the output)."""
        return self.next_u32() >> 31

    def normal(self):
        """Standard normal variate (Box-Muller, cosine branch)."""
        u1 = 1.0 - self.random()  # (0, 1]
        u2 = self.random()
        return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)

    def randint(self, n):
        """Uniform integer in ``[0, n)``."""
        return int(self.random() * n)

    # ------------------------------------------------------------- bulk helpers
    def bits(self, count):
        """Return a list of ``count`` fair bits."""
        nxt = self.next_u32
        return [nxt() >> 31 for _ in range(count)]

    def normals(self, count):
        """Return a list of ``count`` standard normal variates."""
        nrm = self.normal
        return [nrm() for _ in range(count)]

    def randoms(self, count):
        """Return a list of ``count`` uniform doubles in [0, 1)."""
        rnd = self.random
        return [rnd() for _ in range(count)]
