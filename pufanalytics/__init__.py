"""PUFAnalytics -- research-grade evaluation of Physically Unclonable Functions.

Quick start::

    import pufanalytics as pa

    ds = pa.simulate("arbiter", n_devices=32, n_bits=256, n_repeats=10, seed=1)
    result = pa.analyze(ds)
    print(pa.to_markdown(result))

The original string-based functions (``hamming_distance``, ``uniqueness``,
...) remain available unchanged for backward compatibility.
"""

__version__ = "2.0.0"

from .metrics import (
    hamming_distance,
    bit_error_rate,
    intra_puf_variation,
    inter_puf_variation,
    uniqueness,
    reliability,
    avalanche_effect,
    uniformity,
    bit_aliasing,
    correlation_coefficient,
    entropy,
    mutual_information,
    min_entropy,
)
from .rng import PortableRNG
from .dataset import PUFDataset, parse_response, parse_text
from . import quality, stats, nist, ecc, attacks, simulators, sweep as sweeps
from . import estimators
from .simulators import simulate
from .sweep import sweep, quick_metrics
from .attacks import modeling_attack, simulated_attack
from .ecc import plan_key_generation
from .report import analyze, to_json, to_markdown, to_latex

__all__ = [
    "__version__",
    # legacy API
    "hamming_distance", "bit_error_rate", "intra_puf_variation", "inter_puf_variation", "uniqueness",
    "reliability", "avalanche_effect", "uniformity", "bit_aliasing", "correlation_coefficient", "entropy",
    "mutual_information", "min_entropy",
    # v2 API
    "PortableRNG", "PUFDataset", "parse_response", "parse_text", "quality", "stats", "nist", "ecc",
    "attacks", "simulators", "estimators", "simulate", "modeling_attack", "simulated_attack",
    "plan_key_generation", "sweep", "sweeps", "quick_metrics", "analyze", "to_json", "to_markdown", "to_latex",
]
