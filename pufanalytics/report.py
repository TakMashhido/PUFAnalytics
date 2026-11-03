"""One-call analysis of a PUF data set and report generation.

:func:`analyze` computes every metric of the library and returns a plain,
JSON-serialisable dictionary whose structure is identical to the one produced
by the web application, so results can be cross-checked between the two.
"""

import datetime
import json
import math

import numpy as np

from . import estimators as _ent
from . import nist as _nist
from . import quality as Q
from . import stats as S

__all__ = ["analyze", "to_json", "to_markdown", "to_latex", "IDEALS"]

#: Ideal value of every headline metric.
IDEALS = {
    "uniformity": 50.0,
    "bit_aliasing": 50.0,
    "uniqueness": 50.0,
    "reliability": 100.0,
    "steadiness": 100.0,
    "ber": 0.0,
    "min_entropy": 1.0,
    "shannon_entropy": 1.0,
}


def _mean(x):
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    return float(x.mean()) if x.size else float("nan")


def _std(x):
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    return float(x.std(ddof=1)) if x.size > 1 else float("nan")


def _summary(x):
    return {"mean": _mean(x), "std": _std(x), "min": float(np.nanmin(x)) if len(x) else float("nan"),
            "max": float(np.nanmax(x)) if len(x) else float("nan")}


def _bootstrap(ds, ref, inter_m, n_resamples, seed, alpha, reference):
    """Percentile bootstrap over devices for the headline metrics."""
    d = ds.n_devices
    if n_resamples <= 0 or d < 3:
        return None
    idx = S.bootstrap_indices(d, n_resamples, seed)
    uf = ref.mean(axis=1) * 100.0
    rel = Q.reliability(ds, reference)
    n = ds.n_bits
    reps = {"uniformity": [], "uniqueness": [], "reliability": [], "bit_aliasing": []}
    for b in range(n_resamples):
        s = idx[b]
        reps["uniformity"].append(uf[s].mean())
        reps["bit_aliasing"].append(ref[s].mean() * 100.0)
        r = rel[s]
        reps["reliability"].append(r[~np.isnan(r)].mean() if np.any(~np.isnan(r)) else np.nan)
        sub = inter_m[np.ix_(s, s)]
        diff = s[:, None] != s[None, :]
        iu = np.triu(diff, k=1)
        reps["uniqueness"].append(sub[iu].mean() / n * 100.0 if iu.any() else np.nan)
    return {k: {"low": S.percentile_ci(v, alpha)[0], "high": S.percentile_ci(v, alpha)[1]}
            for k, v in reps.items()}


def analyze(data, reference="first", bootstrap=1000, seed=12345, alpha=0.05, nist_alpha=0.01,
            run_nist=True, max_corr_bits=64, max_lag=32):
    """Run the complete PUFAnalytics evaluation.

    Parameters
    ----------
    data : PUFDataset or array-like
    reference : {"first", "majority"}
        Enrolment reference (see :meth:`PUFDataset.reference`).
    bootstrap : int
        Number of bootstrap resamples over devices for confidence intervals
        (0 disables).
    seed : int
        Seed for the bootstrap (portable RNG -> reproducible across platforms).
    alpha : float
        1 - confidence level of the intervals.
    nist_alpha : float
        Significance level of the SP 800-22 tests.
    run_nist : bool
    max_corr_bits, max_lag : int
        Size limits of the bit-correlation matrix and autocorrelation.

    Returns
    -------
    dict (JSON serialisable after :func:`to_json`).
    """
    ds = Q.as_dataset(data)
    n = ds.n_bits
    ref = ds.reference(reference).astype(np.int64)
    out = {
        "meta": {
            "name": ds.name,
            "devices": ds.n_devices,
            "bits": n,
            "measurements_total": int(sum(ds.n_measurements)),
            "measurements_min": int(min(ds.n_measurements)),
            "measurements_max": int(max(ds.n_measurements)),
            "conditions": ds.condition_labels,
            "reference": reference,
            "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "dataset_metadata": ds.metadata,
        }
    }

    uf = Q.uniformity(ds, reference)
    ba = Q.bit_aliasing(ds, reference)
    out["uniformity"] = dict(_summary(uf), per_device=uf.tolist())
    out["bit_aliasing"] = dict(_summary(ba), per_bit=ba.tolist())

    # ---- inter-device
    inter_m = None
    if ds.n_devices >= 2:
        inter_m = Q.inter_hd_matrix(ds, reference)
        inter = Q.inter_hd(ds, reference)
        out["uniqueness"] = {
            "mean": float(inter.mean() / n * 100.0),
            "std": float(inter.std(ddof=1) / n * 100.0) if inter.size > 1 else float("nan"),
            "pairs": int(inter.size),
        }
        out["inter_hd"] = {"histogram": S.histogram_counts(inter, n).tolist(),
                           "fit": S.binomial_fit(inter, n)}
    else:
        inter = np.array([], dtype=np.int64)

    # ---- intra-device
    intra_list = Q.intra_hd(ds, reference)
    intra = np.concatenate(intra_list) if intra_list else np.array([], dtype=np.int64)
    if intra.size:
        rel = Q.reliability(ds, reference)
        st = Q.steadiness(ds)
        fr = Q.bit_flip_rate(ds, reference)
        out["reliability"] = dict(_summary(rel), per_device=rel.tolist())
        out["steadiness"] = dict(_summary(st), per_device=st.tolist())
        out["ber"] = {"mean": float(intra.mean() / n), "max": float(intra.max() / n),
                      "per_bit": fr.tolist()}
        out["stable_bits"] = Q.stable_bit_ratio(ds)
        out["intra_hd"] = {"histogram": S.histogram_counts(intra, n).tolist(),
                           "fit": S.binomial_fit(intra, n)}
        out["conditions"] = Q.condition_ber(ds)

    # ---- identifiability
    if intra.size and inter.size:
        curve = S.far_frr_curve(intra, inter, n)
        eer, idx = S.equal_error_rate(curve["far"], curve["frr"])
        p_intra = max(float(intra.mean() / n), 1e-12)
        p_inter = float(inter.mean() / n)
        model = S.binomial_far_frr(n, p_intra, p_inter)
        out["identification"] = {
            "decidability": S.decidability(intra / n, inter / n),
            "eer": eer,
            "eer_threshold": idx,
            "far": curve["far"].tolist(),
            "frr": curve["frr"].tolist(),
            "binomial": {
                "p_intra": p_intra,
                "p_inter": p_inter,
                "threshold": model["threshold"],
                "far": model["far_at_threshold"],
                "frr": model["frr_at_threshold"],
                "far_curve": model["far"].tolist(),
                "frr_curve": model["frr"].tolist(),
            },
        }

    # ---- entropy & randomness
    pe = _ent.population_entropy(ds, reference)
    stream = ref.ravel()
    out["entropy"] = {
        "shannon_mean": pe["shannon_mean"],
        "min_entropy_mean": pe["min_entropy_mean"],
        "shannon_per_bit": pe["shannon_per_bit"].tolist(),
        "min_entropy_per_bit": pe["min_entropy_per_bit"].tolist(),
        "stream_shannon": _ent.shannon_entropy_rate(stream),
        "mcv_min_entropy": _ent.mcv_min_entropy(stream),
        "markov_min_entropy": _ent.markov_min_entropy(stream),
        "lz_complexity": _ent.lz_complexity(stream) if stream.size <= 200000 else None,
    }
    corr = Q.bit_correlation_matrix(ds, reference, max_bits=max_corr_bits)
    off = corr[~np.eye(corr.shape[0], dtype=bool)]
    off = off[~np.isnan(off)]
    out["correlation"] = {
        "matrix": np.where(np.isnan(corr), None, np.round(corr, 6)).tolist(),
        "mean_abs": float(np.mean(np.abs(off))) if off.size else float("nan"),
        "max_abs": float(np.max(np.abs(off))) if off.size else float("nan"),
        "autocorrelation": Q.autocorrelation(ds, reference, max_lag).tolist(),
    }
    hw = Q.hamming_weights(ds, reference)
    out["hamming_weight"] = {"values": hw.tolist(), "histogram": S.histogram_counts(hw, n).tolist()}
    if run_nist:
        out["nist"] = {"alpha": nist_alpha, "n": int(stream.size), "tests": _nist.run_all(stream, nist_alpha)}

    if inter_m is not None:
        out["inter_hd_matrix"] = (inter_m / n).round(6).tolist()
        ci = _bootstrap(ds, ref, inter_m, int(bootstrap), seed, alpha, reference)
        if ci is not None:
            out["confidence_intervals"] = {"level": 1 - alpha, "resamples": int(bootstrap), "seed": seed, **ci}
    return out


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------
def _clean(obj):
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return _clean(obj.tolist())
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def to_json(result, path=None, indent=2):
    """Serialise an :func:`analyze` result (NaN/inf -> null)."""
    text = json.dumps(_clean(result), indent=indent)
    if path:
        with open(path, "w") as fh:
            fh.write(text)
    return text


def _f(x, digits=3, pct=False):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return "–"
    if pct:
        return ("%." + str(digits) + "f %%") % x
    if isinstance(x, float) and x != 0 and (abs(x) < 1e-3 or abs(x) >= 1e5):
        return "%.3e" % x
    return ("%." + str(digits) + "f") % x


def headline_rows(r):
    """Rows (metric, value, ideal, CI) shared by Markdown and LaTeX output."""
    ci = r.get("confidence_intervals", {})

    def c(key):
        if key in ci:
            return "[%s, %s]" % (_f(ci[key]["low"], 2), _f(ci[key]["high"], 2))
        return ""

    rows = [("Uniformity (%)", _f(r["uniformity"]["mean"], 2), "50", c("uniformity")),
            ("Bit-aliasing (%)", _f(r["bit_aliasing"]["mean"], 2), "50", c("bit_aliasing"))]
    if "uniqueness" in r:
        rows.append(("Uniqueness (%)", _f(r["uniqueness"]["mean"], 2), "50", c("uniqueness")))
    if "reliability" in r:
        rows += [("Reliability (%)", _f(r["reliability"]["mean"], 2), "100", c("reliability")),
                 ("Steadiness (%)", _f(r["steadiness"]["mean"], 2), "100", ""),
                 ("Mean BER", _f(r["ber"]["mean"], 4), "0", ""),
                 ("Stable bits", _f(r["stable_bits"], 4), "1", "")]
    if "identification" in r:
        idn = r["identification"]
        rows += [("Decidability d'", _f(idn["decidability"], 2), "> 6", ""),
                 ("Empirical EER", _f(idn["eer"], 4), "0", ""),
                 ("Binomial FAR @ t*=%d" % idn["binomial"]["threshold"], _f(idn["binomial"]["far"]), "0", ""),
                 ("Binomial FRR @ t*=%d" % idn["binomial"]["threshold"], _f(idn["binomial"]["frr"]), "0", "")]
    e = r["entropy"]
    rows += [("Shannon entropy / bit", _f(e["shannon_mean"], 4), "1", ""),
             ("Min-entropy / bit", _f(e["min_entropy_mean"], 4), "1", ""),
             ("MCV min-entropy (SP 800-90B)", _f(e["mcv_min_entropy"], 4), "1", ""),
             ("Markov min-entropy (SP 800-90B)", _f(e["markov_min_entropy"], 4), "1", "")]
    return rows


def to_markdown(result, path=None):
    """Render an :func:`analyze` result as a Markdown report."""
    r = result
    m = r["meta"]
    lines = ["# PUF evaluation report: %s" % m["name"], "",
             "*%d devices, %d bits, %d measurements (reference: %s), generated %s with PUFAnalytics.*"
             % (m["devices"], m["bits"], m["measurements_total"], m["reference"], m["generated"]), "",
             "## Headline metrics", "", "| Metric | Value | Ideal | %s |" %
             ("%d%% CI" % round(100 * r["confidence_intervals"]["level"]) if "confidence_intervals" in r else "CI"),
             "|---|---|---|---|"]
    for row in headline_rows(r):
        lines.append("| %s | %s | %s | %s |" % row)
    if r.get("conditions"):
        lines += ["", "## Bit error rate per operating condition", "", "| Condition | BER | Measurements |",
                  "|---|---|---|"]
        for cnd, v in r["conditions"].items():
            lines.append("| %s | %s | %d |" % (cnd, _f(v["ber"], 4), v["n"]))
    if "nist" in r:
        lines += ["", "## NIST SP 800-22 (alpha = %s, n = %d bits)" % (r["nist"]["alpha"], r["nist"]["n"]), "",
                  "| Test | p-value | Result |", "|---|---|---|"]
        for t in r["nist"]["tests"]:
            res = "n/a (%s)" % t["note"] if not t["applicable"] else ("PASS" if t["passed"] else "FAIL")
            lines.append("| %s | %s | %s |" % (t["name"], _f(t["p_value"], 4), res))
    text = "\n".join(lines) + "\n"
    if path:
        with open(path, "w") as fh:
            fh.write(text)
    return text


def to_latex(result, path=None, caption=None, label="tab:puf-metrics"):
    """Render the headline metrics as a LaTeX ``table`` (booktabs)."""
    def esc(s):
        return s.replace("%", r"\%").replace("_", r"\_").replace("'", "$'$").replace("@", "at").replace("*", "$^*$").replace("> ", "$>$ ")

    m = result["meta"]
    cap = caption or "Evaluation of %s (%d devices, %d-bit responses)." % (m["name"], m["devices"], m["bits"])
    lines = [r"\begin{table}[t]", r"\centering", r"\caption{%s}" % esc(cap), r"\label{%s}" % label,
             r"\begin{tabular}{lrrr}", r"\toprule", r"Metric & Value & Ideal & CI \\", r"\midrule"]
    for a, b, c, d in headline_rows(result):
        lines.append(r"%s & %s & %s & %s \\" % (esc(a), esc(b), esc(c), esc(d)))
    lines += [r"\bottomrule", r"\end{tabular}", r"\end{table}"]
    text = "\n".join(lines) + "\n"
    if path:
        with open(path, "w") as fh:
            fh.write(text)
    return text
