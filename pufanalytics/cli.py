"""Command-line interface: ``pufanalytics <command> ...``.

Commands
--------
analyze   Evaluate a data file and print / save a report.
simulate  Generate a synthetic PUF population (portable, seeded).
nist      Run the NIST SP 800-22 tests on the enrolled responses.
attack    Logistic-regression modelling attack on a simulated Arbiter PUF.
ecc       Plan error correction for secure key generation.
"""

import argparse
import json
import sys

from . import __version__
from .attacks import simulated_attack
from .dataset import PUFDataset
from .ecc import plan_key_generation
from .nist import run_all
from .report import analyze, to_json, to_latex, to_markdown
from .simulators import simulate


def _cmd_analyze(a):
    ds = PUFDataset.from_file(a.file, fmt=a.format)
    res = analyze(ds, reference=a.reference, bootstrap=a.bootstrap, seed=a.seed, run_nist=not a.no_nist)
    if a.json:
        to_json(res, a.json)
    if a.latex:
        to_latex(res, a.latex)
    md = to_markdown(res, a.markdown)
    if not (a.json or a.latex or a.markdown) or a.verbose:
        sys.stdout.write(md)


def _parse_conditions(spec):
    if not spec:
        return None
    out = []
    for part in spec.split(","):
        lbl, _, scale = part.partition(":")
        out.append((lbl, float(scale or 1.0)))
    return out


def _cmd_simulate(a):
    params = {}
    for kv in a.param or []:
        k, _, v = kv.partition("=")
        try:
            params[k] = float(v) if "." in v or "e" in v.lower() else int(v)
        except ValueError:
            params[k] = v
    ds = simulate(a.model, n_devices=a.devices, n_bits=a.bits, n_repeats=a.repeats, seed=a.seed,
                  conditions=_parse_conditions(a.conditions), **params)
    if a.output.endswith(".json"):
        with open(a.output, "w") as fh:
            json.dump(ds.to_dict(), fh)
    else:
        ds.to_csv(a.output)
    print("wrote %r to %s" % (ds, a.output))


def _cmd_nist(a):
    ds = PUFDataset.from_file(a.file, fmt=a.format)
    stream = ds.reference(a.reference).ravel()
    for t in run_all(stream, a.alpha):
        status = "n/a" if not t["applicable"] else ("PASS" if t["passed"] else "FAIL")
        p = "-" if t["p_value"] is None else "%.6f" % t["p_value"]
        print("%-24s p=%-10s %s %s" % (t["name"], p, status, t["note"]))


def _cmd_attack(a):
    sizes = [int(s) for s in a.train_sizes.split(",")]
    r = simulated_attack(stages=a.stages, xor=a.xor, noise=a.noise, train_sizes=sizes, test_size=a.test_size,
                         seed=a.seed)
    print("CRPs      train-acc  test-acc")
    for n, tr, te in zip(r["train_sizes"], r["train_accuracy"], r["test_accuracy"]):
        print("%-9d %.4f     %.4f" % (n, tr, te))


def _cmd_ecc(a):
    plans = plan_key_generation(a.ber, a.min_entropy, a.key_bits, a.target)
    print("%-18s %3s %7s %9s %11s %s" % ("code", "rep", "blocks", "PUF bits", "failure", "ok"))
    for p in plans[: a.top]:
        if p["blocks"] is None:
            continue
        print("%-18s %3d %7d %9d %11.3e %s" % (p["code"], p["repetition"], p["blocks"], p["puf_bits"],
                                               p["failure"], "yes" if p["feasible"] else "no"))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="pufanalytics", description="Research-grade PUF evaluation toolkit")
    ap.add_argument("--version", action="version", version="pufanalytics " + __version__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("analyze", help="evaluate a data file")
    p.add_argument("file")
    p.add_argument("--format", default="auto", choices=["auto", "bin", "hex"])
    p.add_argument("--reference", default="first", choices=["first", "majority"])
    p.add_argument("--bootstrap", type=int, default=1000)
    p.add_argument("--seed", type=int, default=12345)
    p.add_argument("--no-nist", action="store_true")
    p.add_argument("--json")
    p.add_argument("--markdown")
    p.add_argument("--latex")
    p.add_argument("-v", "--verbose", action="store_true")
    p.set_defaults(func=_cmd_analyze)

    p = sub.add_parser("simulate", help="generate a synthetic population")
    p.add_argument("model", choices=["arbiter", "ff_arbiter", "interpose", "ro", "sram", "dram", "ideal"])
    p.add_argument("-o", "--output", required=True, help=".csv or .json")
    p.add_argument("--devices", type=int, default=20)
    p.add_argument("--bits", type=int, default=128)
    p.add_argument("--repeats", type=int, default=5)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--conditions", help="e.g. 25C:1,85C:2.5,-40C:2")
    p.add_argument("--param", action="append", help="model parameter key=value (repeatable)")
    p.set_defaults(func=_cmd_simulate)

    p = sub.add_parser("nist", help="NIST SP 800-22 tests")
    p.add_argument("file")
    p.add_argument("--format", default="auto", choices=["auto", "bin", "hex"])
    p.add_argument("--reference", default="first", choices=["first", "majority"])
    p.add_argument("--alpha", type=float, default=0.01)
    p.set_defaults(func=_cmd_nist)

    p = sub.add_parser("attack", help="modelling attack on a simulated Arbiter PUF")
    p.add_argument("--stages", type=int, default=64)
    p.add_argument("--xor", type=int, default=1)
    p.add_argument("--noise", type=float, default=0.05)
    p.add_argument("--train-sizes", default="50,100,200,500,1000,2000,5000")
    p.add_argument("--test-size", type=int, default=2000)
    p.add_argument("--seed", type=int, default=7)
    p.set_defaults(func=_cmd_attack)

    p = sub.add_parser("ecc", help="plan fuzzy-extractor error correction")
    p.add_argument("--ber", type=float, required=True)
    p.add_argument("--min-entropy", type=float, default=1.0)
    p.add_argument("--key-bits", type=int, default=128)
    p.add_argument("--target", type=float, default=1e-6)
    p.add_argument("--top", type=int, default=15)
    p.set_defaults(func=_cmd_ecc)

    a = ap.parse_args(argv)
    a.func(a)


if __name__ == "__main__":  # pragma: no cover
    main()
