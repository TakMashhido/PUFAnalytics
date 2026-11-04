"""Generate reference values used by the JavaScript parity test (web/tests/parity.test.mjs).

Run from the repository root:  python tests/make_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pufanalytics as pa  # noqa: E402
from pufanalytics.report import _clean  # noqa: E402

CASES = [
    dict(model="arbiter", n_devices=12, n_bits=96, n_repeats=4, seed=3, conditions=[["25C", 1.0], ["85C", 2.5]],
         params={"stages": 32, "xor": 1, "noise": 0.08}),
    dict(model="arbiter", n_devices=6, n_bits=64, n_repeats=2, seed=11, conditions=None, params={"stages": 16, "xor": 3, "noise": 0.05}),
    dict(model="ro", n_devices=10, n_bits=80, n_repeats=3, seed=5, conditions=None,
         params={"sigma_process": 1.0, "noise": 0.15, "gradient": 2.0, "pairing": "neighbor"}),
    dict(model="ro", n_devices=8, n_bits=40, n_repeats=2, seed=6, conditions=None, params={"pairing": "disjoint", "noise": 0.2}),
    dict(model="sram", n_devices=15, n_bits=128, n_repeats=5, seed=9, conditions=[["nom", 1.0], ["hot", 3.0]],
         params={"noise": 0.12, "bias": 0.1}),
    dict(model="ideal", n_devices=20, n_bits=200, n_repeats=3, seed=2, conditions=None, params={"flip_prob": 0.04}),
    dict(model="ff_arbiter", n_devices=10, n_bits=96, n_repeats=3, seed=21, conditions=[["25C", 1.0], ["85C", 2.0]],
         params={"stages": 32, "loops": 2, "noise": 0.1}),
    dict(model="interpose", n_devices=8, n_bits=80, n_repeats=3, seed=22, conditions=None,
         params={"stages": 32, "x": 2, "y": 1, "noise": 0.08}),
    dict(model="dram", n_devices=12, n_bits=128, n_repeats=3, seed=23, conditions=[["25C", 1.0], ["85C", 2.5]],
         params={"noise": 0.15, "threshold": 0.2, "temp_shift": 0.4}),
]


def main():
    out = {}
    r = pa.PortableRNG(42)
    out["rng_u32"] = [r.next_u32() for _ in range(16)]
    r = pa.PortableRNG(2024)
    out["rng_normals"] = r.normals(16)
    out["cases"] = []
    for c in CASES:
        ds = pa.simulate(c["model"], n_devices=c["n_devices"], n_bits=c["n_bits"], n_repeats=c["n_repeats"], seed=c["seed"],
                         conditions=c["conditions"], **c["params"])
        res = pa.analyze(ds, bootstrap=200, seed=99)
        out["cases"].append({"spec": c, "dataset": ds.to_dict(), "result": _clean(res)})
        if "csv_hex" not in out:
            out["csv_hex"] = ds.to_csv(fmt="hex")
            out["csv_hex_dataset"] = ds.to_dict()
    out["attack"] = _clean(pa.simulated_attack(stages=16, xor=1, noise=0.05, train_sizes=(50, 200, 800), test_size=500, seed=4))
    out["ecc"] = _clean(pa.plan_key_generation(0.08, 0.9, 128, 1e-6)[:10])
    tds = pa.simulate("sram", n_devices=6, n_bits=64, n_repeats=7, seed=31, noise=0.4)
    out["tmv"] = pa.quality.tmv_ber(tds)
    out["length"] = pa.stats.identification_vs_length(0.06, 0.49, [8, 16, 33, 64, 128])
    out["sweep"] = _clean(pa.sweep("arbiter", "noise", [0.02, 0.2], param2="n_devices", values2=[4, 9], seeds=2, seed=5,
                                   n_devices=6, n_bits=48, n_repeats=3, stages=16))
    out["attack_ff"] = _clean(pa.simulated_attack(stages=16, noise=0.05, train_sizes=(100, 400), test_size=300, seed=3,
                                                  model="ff_arbiter", loops=1))
    path = os.path.join(os.path.dirname(__file__), "..", "web", "tests", "golden.json")
    with open(path, "w") as fh:
        json.dump(out, fh)
    print("wrote", os.path.normpath(path))


if __name__ == "__main__":
    main()
