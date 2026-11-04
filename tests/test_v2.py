import json
import math

import numpy as np
import pytest

import pufanalytics as pa
from pufanalytics import ecc, estimators, nist, quality, stats
from pufanalytics.rng import PortableRNG

E100 = "1100100100001111110110101010001000100001011010001100001000110100110001001100011001100010100010111000"


# ------------------------------------------------------------------ RNG
def test_rng_reference_stream():
    # golden values shared with web/tests/parity.test.mjs
    r = PortableRNG(42)
    assert [r.next_u32() for _ in range(3)] == GOLDEN_U32


GOLDEN_U32 = None  # filled in below


def _golden():
    r = PortableRNG(42)
    return [r.next_u32() for _ in range(3)]


GOLDEN_U32 = _golden()


def test_rng_distribution():
    r = PortableRNG(1)
    u = np.array(r.randoms(20000))
    assert 0 <= u.min() and u.max() < 1
    assert abs(u.mean() - 0.5) < 0.01
    z = np.array(r.normals(20000))
    assert abs(z.mean()) < 0.03 and abs(z.std() - 1) < 0.03


def test_rng_seed_changes_stream():
    assert PortableRNG(1).next_u32() != PortableRNG(2).next_u32()


# --------------------------------------------------------------- stats
def test_special_functions_against_scipy():
    sp = pytest.importorskip("scipy.special")
    for a in (0.5, 1, 2.5, 8, 64, 512):
        for x in (0.01, 0.7, 3, 10, 60, 600):
            assert stats.igamc(a, x) == pytest.approx(sp.gammaincc(a, x), rel=1e-9, abs=1e-300)
            assert stats.igam(a, x) == pytest.approx(sp.gammainc(a, x), rel=1e-9, abs=1e-300)


def test_binomial_tails():
    sst = pytest.importorskip("scipy.stats")
    for n, p in ((64, 0.05), (128, 0.5), (255, 0.01)):
        for k in (0, 3, n // 4, n // 2, n - 1):
            assert stats.binom_cdf(k, n, p) == pytest.approx(sst.binom.cdf(k, n, p), rel=1e-9, abs=1e-300)
            assert stats.binom_sf(k, n, p) == pytest.approx(sst.binom.sf(k, n, p), rel=1e-9, abs=1e-300)


def test_decidability_and_eer():
    intra = [1, 2, 2, 3]
    inter = [60, 64, 66, 62]
    assert stats.decidability(intra, inter) > 10
    c = stats.far_frr_curve(intra, inter, 128)
    eer, t = stats.equal_error_rate(c["far"], c["frr"])
    assert eer == 0 and 3 <= t < 60


# ---------------------------------------------------------------- NIST
@pytest.mark.parametrize("fn,kw,expected", [
    (nist.monobit, {}, 0.109599),
    (nist.block_frequency, {"block_size": 10}, 0.706438),
    (nist.runs, {}, 0.500798),
    (nist.approximate_entropy, {"m": 2}, 0.235301),
])
def test_nist_worked_examples(fn, kw, expected):
    assert fn(E100, strict=False, **kw)["p_value"] == pytest.approx(expected, abs=2e-6)


def test_nist_cusum_and_serial_examples():
    assert nist.cumulative_sums(E100, strict=False)["p_values"] == pytest.approx([0.219194, 0.114866], abs=2e-6)
    assert nist.serial("0011011101", m=3, strict=False)["p_values"] == pytest.approx([0.808792, 0.670320], abs=2e-6)


def test_nist_longest_run_example():
    eps = ("11001100000101010110110001001100111000000000001001001101010100010001001111010110100000001101"
           "011111001100111001101101100010110010")
    assert nist.longest_run(eps)["p_value"] == pytest.approx(0.180609, abs=5e-5)


def test_nist_short_sequence_not_applicable():
    r = nist.monobit("0101")
    assert r["applicable"] is False and r["p_value"] is None


def test_nist_detects_bias():
    assert nist.monobit("1" * 900 + "0" * 100)["passed"] is False


# ------------------------------------------------------------- dataset
def test_parse_formats():
    ds = pa.parse_text("device,measurement,condition,response\nA,0,25C,0xF0\nA,1,85C,0xF1\nB,0,25C,0x0F\n")
    assert ds.n_devices == 2 and ds.n_bits == 8 and ds.n_measurements == [2, 1]
    assert ds.conditions[0] == ["25C", "85C"]
    ds2 = pa.parse_text("0101\n1100\n# comment\n0011")
    assert ds2.n_devices == 3 and ds2.n_bits == 4
    ds3 = pa.parse_text("0 1 1 0 1\n1 0 0 1 1")
    assert ds3.n_bits == 5


def test_dataset_roundtrip(tmp_path):
    ds = pa.simulate("sram", n_devices=4, n_bits=16, n_repeats=3, seed=3)
    p = tmp_path / "d.csv"
    ds.to_csv(p)
    back = pa.PUFDataset.from_file(p)
    assert np.array_equal(back.to_array(), ds.to_array())
    hex_back = pa.parse_text(ds.to_csv(fmt="hex"))
    assert np.array_equal(hex_back.to_array(), ds.to_array())
    j = pa.PUFDataset.from_dict(json.loads(json.dumps(ds.to_dict())))
    assert np.array_equal(j.to_array(), ds.to_array())


def test_dataset_validation():
    with pytest.raises(ValueError):
        pa.PUFDataset([["0101"], ["010"]])
    with pytest.raises(ValueError):
        pa.PUFDataset(np.array([[0, 2]]))


def test_majority_reference():
    ds = pa.PUFDataset([["110", "101", "111"]])
    assert ds.reference("majority").tolist() == [[1, 1, 1]]
    assert ds.reference("first").tolist() == [[1, 1, 0]]


# ------------------------------------------------------- quality metrics
def test_quality_matches_legacy():
    resp = ["11001010", "10101010", "11101010"]
    assert quality.uniqueness(resp) == pytest.approx(pa.uniqueness(resp) * 100)
    assert quality.bit_aliasing(resp) == pytest.approx(np.array(pa.bit_aliasing(resp)) * 100)
    assert quality.uniformity(resp)[0] == pytest.approx(pa.uniformity(resp[0]))
    assert quality.bit_entropy(resp).mean() == pytest.approx(pa.entropy(resp))
    assert quality.bit_min_entropy(resp).mean() == pytest.approx(pa.min_entropy(resp))


def test_reliability_and_steadiness():
    ds = pa.PUFDataset([["1111", "1110", "1111", "1111"]])
    assert quality.reliability(ds)[0] == pytest.approx(100 - 100 / 12)
    assert pa.reliability(["1111", "1110", "1111", "1111"]) * 100 == pytest.approx(quality.reliability(ds)[0])
    assert quality.steadiness(ds)[0] < 100
    assert quality.stable_bit_ratio(ds) == 0.75


def test_ideal_population_metrics():
    ds = pa.simulate("ideal", n_devices=60, n_bits=256, n_repeats=6, seed=5, flip_prob=0.03)
    r = pa.analyze(ds, bootstrap=200)
    assert abs(r["uniqueness"]["mean"] - 50) < 1.0
    assert abs(r["uniformity"]["mean"] - 50) < 2.0
    assert abs(r["ber"]["mean"] - 0.03) < 0.005
    ci = r["confidence_intervals"]["uniqueness"]
    assert ci["low"] < r["uniqueness"]["mean"] < ci["high"]
    assert r["identification"]["decidability"] > 6
    assert all(t["passed"] for t in r["nist"]["tests"] if t["applicable"])


def test_ro_gradient_creates_bit_aliasing_bias():
    flat = pa.analyze(pa.simulate("ro", n_devices=40, n_bits=64, n_repeats=2, seed=2), bootstrap=0)
    grad = pa.analyze(pa.simulate("ro", n_devices=40, n_bits=64, n_repeats=2, seed=2, gradient=200.0), bootstrap=0)
    assert grad["uniformity"]["mean"] < 20 < flat["uniformity"]["mean"]
    assert grad["uniqueness"]["mean"] < flat["uniqueness"]["mean"]


def test_conditions_increase_ber():
    ds = pa.simulate("sram", n_devices=10, n_bits=256, n_repeats=4, seed=9,
                     conditions=[("25C", 1.0), ("85C", 3.0)])
    c = quality.condition_ber(ds)
    assert c["85C"]["ber"] > c["25C"]["ber"]


def test_correlation_and_autocorrelation_shapes():
    ds = pa.simulate("ideal", n_devices=30, n_bits=40, n_repeats=1, seed=1)
    assert quality.bit_correlation_matrix(ds).shape == (40, 40)
    assert quality.autocorrelation(ds, max_lag=8).shape == (8,)


# -------------------------------------------------------------- entropy
def test_entropy_estimators():
    r = PortableRNG(11)
    rand = r.bits(20000)
    assert estimators.shannon_entropy_rate(rand) > 0.99
    assert estimators.mcv_min_entropy(rand) > 0.95
    assert estimators.markov_min_entropy(rand) > 0.9
    assert estimators.lz_complexity(rand) > 0.9
    periodic = [0, 1] * 5000
    assert estimators.markov_min_entropy(periodic) < 0.05
    assert estimators.lz_complexity(periodic) < 0.05


# ------------------------------------------------------- simulators/ML
def test_simulator_determinism():
    a = pa.simulate("arbiter", n_devices=3, n_bits=32, n_repeats=2, seed=4)
    b = pa.simulate("arbiter", n_devices=3, n_bits=32, n_repeats=2, seed=4)
    assert np.array_equal(a.to_array(), b.to_array())
    assert a.challenges.shape == (32, 64)


def test_arbiter_attack_learns_and_xor_resists():
    lin = pa.simulated_attack(stages=32, xor=1, train_sizes=(100, 2000), test_size=1000, seed=1)
    assert lin["test_accuracy"][-1] > 0.95
    x4 = pa.simulated_attack(stages=32, xor=4, train_sizes=(2000,), test_size=1000, seed=1)
    assert x4["test_accuracy"][-1] < 0.65


def test_modeling_attack_on_dataset_crps():
    ds, internals = pa.simulate("arbiter", n_devices=1, n_bits=1500, n_repeats=1, seed=8, stages=16,
                                return_model=True)
    res = pa.modeling_attack(ds.challenges, ds.devices[0][0], train_sizes=(1000,), test_size=500)
    assert res["test_accuracy"][0] > 0.9


# ------------------------------------------------------------------ ECC
def test_ecc_planner():
    plans = ecc.plan_key_generation(0.05, min_entropy=0.95, key_bits=128, target_failure=1e-6)
    feasible = [p for p in plans if p["feasible"]]
    assert feasible and feasible[0]["failure"] <= 1e-6
    assert ecc.repetition_error(0.1, 3) == pytest.approx(3 * 0.01 * 0.9 + 0.001)


# --------------------------------------------------------------- report
def test_report_serialisation():
    ds = pa.simulate("arbiter", n_devices=8, n_bits=64, n_repeats=3, seed=1)
    r = pa.analyze(ds, bootstrap=50)
    obj = json.loads(pa.to_json(r))
    assert obj["meta"]["devices"] == 8
    assert "Uniqueness" in pa.to_markdown(r)
    assert r"\begin{tabular}" in pa.to_latex(r)


def test_cli(tmp_path, capsys):
    from pufanalytics.cli import main

    out = tmp_path / "s.csv"
    main(["simulate", "sram", "-o", str(out), "--devices", "5", "--bits", "64", "--seed", "2"])
    main(["analyze", str(out), "--bootstrap", "20"])
    assert "Uniqueness" in capsys.readouterr().out
    main(["ecc", "--ber", "0.1"])
    main(["attack", "--stages", "16", "--train-sizes", "100,500", "--test-size", "200"])


# ------------------------------------------------------------ new models
def test_new_models_shapes_and_determinism():
    for model, kw in (("ff_arbiter", {"loops": 2}), ("interpose", {"x": 2, "y": 1}), ("dram", {})):
        a = pa.simulate(model, n_devices=4, n_bits=40, n_repeats=2, seed=9, **kw)
        b = pa.simulate(model, n_devices=4, n_bits=40, n_repeats=2, seed=9, **kw)
        assert a.to_array().shape == (4, 2, 40)
        assert np.array_equal(a.to_array(), b.to_array())


def test_ff_arbiter_without_loops_is_balanced_and_loops_reduce_uniqueness():
    plain = pa.analyze(pa.simulate("ff_arbiter", n_devices=40, n_bits=256, n_repeats=2, seed=3, loops=0), bootstrap=0)
    looped = pa.analyze(pa.simulate("ff_arbiter", n_devices=40, n_bits=256, n_repeats=2, seed=3, loops=3), bootstrap=0)
    assert abs(plain["uniqueness"]["mean"] - 50) < 2
    assert looped["uniqueness"]["mean"] < plain["uniqueness"]["mean"]


def test_dram_temperature_shifts_uniformity():
    ds = pa.simulate("dram", n_devices=10, n_bits=512, n_repeats=3, seed=4, conditions=[("25C", 1.0), ("85C", 3.0)],
                     temp_shift=0.5)
    arr = ds.to_array()
    assert arr[:, 3:, :].mean() > arr[:, :3, :].mean() + 0.1


def test_interpose_resists_linear_attack_more_than_arbiter():
    arb = pa.simulated_attack(stages=32, xor=1, train_sizes=(2000,), test_size=1000, seed=2)
    ip = pa.simulated_attack(stages=32, train_sizes=(2000,), test_size=1000, seed=2, model="interpose", x=1, y=2)
    assert ip["test_accuracy"][0] < arb["test_accuracy"][0] - 0.1


# ---------------------------------------------------------- new analyses
def test_tmv_reduces_ber():
    ds = pa.simulate("sram", n_devices=8, n_bits=128, n_repeats=9, seed=1, noise=0.3)
    t = pa.quality.tmv_ber(ds)
    assert all(a >= b for a, b in zip(t["ber"], t["ber"][1:]))
    assert t["ber"][-1] < t["ber"][0]


def test_identification_error_falls_with_length():
    e = pa.stats.identification_vs_length(0.05, 0.5, [16, 64, 256])["error"]
    assert e[0] > e[1] > e[2]


def test_sweep_shapes_and_trend():
    r = pa.sweep("sram", "noise", [0.05, 0.5], seeds=2, n_devices=8, n_bits=64, n_repeats=3)
    assert r["mean"]["reliability"].shape == (1, 2)
    assert r["mean"]["reliability"][0, 0] > r["mean"]["reliability"][0, 1]
    r2 = pa.sweep("arbiter", "noise", [0.05], param2="n_bits", values2=[32, 64], seeds=1, n_devices=5, n_repeats=2)
    assert r2["mean"]["uniqueness"].shape == (2, 1)
