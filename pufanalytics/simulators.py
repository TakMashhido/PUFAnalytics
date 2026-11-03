"""Reproducible PUF population simulators.

Four widely used PUF models are provided.  Every simulator draws all random
numbers from :class:`~pufanalytics.rng.PortableRNG` in a documented order,
which is mirrored exactly by the web application (``web/js/core/simulators.js``),
so a population generated in the browser can be regenerated in Python from
its seed and parameters.

Models
------
``arbiter``      Additive linear delay model of a k-stage Arbiter PUF
                 (Lim et al. 2005; Rührmair et al. 2010), optionally XOR-ed
                 over several parallel chains (k-XOR Arbiter PUF).
``ro``           Ring-oscillator PUF (Suh & Devadas 2007) with random process
                 variation, a deterministic systematic spatial gradient and
                 measurement noise; neighbour or disjoint pairing.
``sram``         SRAM power-up PUF: every cell has a static mismatch
                 ``N(bias, 1)`` plus thermal noise at each power-up.
``ideal``        Ideal random PUF with independent bit flips (reference model).

Environmental corners are modelled with *conditions*: a list of
``(label, noise_scale)`` pairs; every condition contributes ``n_repeats``
measurements whose noise standard deviation is multiplied by ``noise_scale``.
Measurement 0 (first condition, first repeat) is the enrolment read-out.
"""

import numpy as np

from .dataset import PUFDataset
from .rng import PortableRNG

__all__ = ["simulate", "arbiter_features", "SIMULATORS"]


def arbiter_features(challenges):
    """Parity feature transform of the additive delay model.

    ``phi_i = prod_{j>=i} (1 - 2 c_j)`` for ``i < k`` and ``phi_k = 1``.
    """
    c = np.asarray(challenges, dtype=np.int64)
    signs = 1 - 2 * c
    phi = np.cumprod(signs[:, ::-1], axis=1)[:, ::-1]
    return np.hstack([phi, np.ones((c.shape[0], 1), dtype=np.int64)]).astype(float)


def _conditions(conditions):
    if not conditions:
        return [("nominal", 1.0)]
    return [(str(lbl), float(scale)) for lbl, scale in conditions]


def _measure_schedule(conditions, n_repeats):
    sched = []
    for lbl, scale in _conditions(conditions):
        for _ in range(n_repeats):
            sched.append((lbl, scale))
    return sched


def _sim_arbiter(rng, n_devices, n_bits, sched, stages=64, xor=1, noise=0.05, **_):
    k, x = int(stages), int(xor)
    challenges = np.array(rng.bits(n_bits * k), dtype=np.uint8).reshape(n_bits, k)
    phi = arbiter_features(challenges)
    weights = np.array(rng.normals(n_devices * x * (k + 1))).reshape(n_devices, x, k + 1)
    clean = np.einsum("ck,dxk->dxc", phi, weights)  # (devices, chains, challenges)
    m = len(sched)
    z = np.array(rng.normals(n_devices * m * n_bits * x)).reshape(n_devices, m, n_bits, x)
    scales = np.array([s for _, s in sched])
    delay = clean.transpose(0, 2, 1)[:, None, :, :] + noise * scales[None, :, None, None] * z
    bits = (delay > 0).astype(np.uint8)
    resp = np.bitwise_xor.reduce(bits, axis=3)
    return resp, challenges, {"weights": weights}


def _sim_ro(rng, n_devices, n_bits, sched, sigma_process=1.0, noise=0.1, gradient=0.0,
            pairing="neighbor", **_):
    n_ro = n_bits + 1 if pairing == "neighbor" else 2 * n_bits
    pos = np.arange(n_ro) / max(n_ro - 1, 1)
    systematic = gradient * pos
    freq = np.array(rng.normals(n_devices * n_ro)).reshape(n_devices, n_ro) * sigma_process + systematic
    m = len(sched)
    z = np.array(rng.normals(n_devices * m * n_ro)).reshape(n_devices, m, n_ro)
    scales = np.array([s for _, s in sched])
    meas = freq[:, None, :] + noise * scales[None, :, None] * z
    if pairing == "neighbor":
        resp = (meas[:, :, :-1] > meas[:, :, 1:]).astype(np.uint8)
    else:
        resp = (meas[:, :, 0::2] > meas[:, :, 1::2]).astype(np.uint8)
    return resp, None, {}


def _sim_sram(rng, n_devices, n_bits, sched, noise=0.1, bias=0.0, **_):
    skew = np.array(rng.normals(n_devices * n_bits)).reshape(n_devices, n_bits) + bias
    m = len(sched)
    z = np.array(rng.normals(n_devices * m * n_bits)).reshape(n_devices, m, n_bits)
    scales = np.array([s for _, s in sched])
    resp = (skew[:, None, :] + noise * scales[None, :, None] * z > 0).astype(np.uint8)
    return resp, None, {}


def _sim_ideal(rng, n_devices, n_bits, sched, flip_prob=0.02, **_):
    base = np.array(rng.bits(n_devices * n_bits), dtype=np.uint8).reshape(n_devices, n_bits)
    m = len(sched)
    u = np.array(rng.randoms(n_devices * m * n_bits)).reshape(n_devices, m, n_bits)
    scales = np.array([s for _, s in sched])
    flips = (u < np.minimum(flip_prob * scales, 0.5)[None, :, None]).astype(np.uint8)
    flips[:, 0, :] = 0  # enrolment read-out is the noiseless reference
    resp = base[:, None, :] ^ flips
    return resp, None, {}


SIMULATORS = {"arbiter": _sim_arbiter, "ro": _sim_ro, "sram": _sim_sram, "ideal": _sim_ideal}


def simulate(model="arbiter", n_devices=20, n_bits=128, n_repeats=5, seed=1, conditions=None,
             return_model=False, **params):
    """Simulate a PUF population.

    Parameters
    ----------
    model : {"arbiter", "ro", "sram", "ideal"}
    n_devices : int
        Number of PUF instances (chips).
    n_bits : int
        Response bits per measurement (number of challenges for an Arbiter PUF).
    n_repeats : int
        Measurements per condition.
    seed : int
        Seed of the portable RNG.
    conditions : list of (label, noise_scale), optional
    **params
        Model parameters:

        * arbiter: ``stages`` (64), ``xor`` (1), ``noise`` (0.05)
        * ro: ``sigma_process`` (1.0), ``noise`` (0.1), ``gradient`` (0.0),
          ``pairing`` ("neighbor" | "disjoint")
        * sram: ``noise`` (0.1), ``bias`` (0.0)
        * ideal: ``flip_prob`` (0.02)

    Returns
    -------
    PUFDataset (and the internal model dict if ``return_model``).
    """
    if model not in SIMULATORS:
        raise ValueError("Unknown model %r; choose from %s" % (model, sorted(SIMULATORS)))
    rng = PortableRNG(seed)
    sched = _measure_schedule(conditions, int(n_repeats))
    resp, challenges, internals = SIMULATORS[model](rng, int(n_devices), int(n_bits), sched, **params)
    labels = [lbl for lbl, _ in sched]
    meta = {"simulator": model, "seed": int(seed), "n_repeats": int(n_repeats),
            "conditions": _conditions(conditions), "params": params}
    ds = PUFDataset(
        resp,
        device_ids=["D%d" % i for i in range(n_devices)],
        conditions=[list(labels) for _ in range(n_devices)],
        challenges=challenges,
        name="%s-sim-seed%d" % (model, seed),
        metadata=meta,
    )
    if return_model:
        return ds, internals
    return ds
