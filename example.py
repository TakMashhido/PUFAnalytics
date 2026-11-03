"""PUFAnalytics examples: the classic string API and the v2 research workflow."""
import pufanalytics as pa
from pufanalytics import hamming_distance, bit_error_rate, intra_puf_variation, inter_puf_variation, uniqueness, \
    reliability, avalanche_effect, uniformity, bit_aliasing, entropy, mutual_information, correlation_coefficient, \
    min_entropy

# ---------------------------------------------------------------------------
# 1. Classic API: plain bit strings
# ---------------------------------------------------------------------------
# Responses of the same PUF under different conditions
puf1_responses = ["11001010", "11001011", "11011010"]
# Responses of different PUF instances to the same challenge
puf_responses = ["11001010", "10101010", "11101010"]

print("Hamming Distance:", hamming_distance(puf1_responses[0], puf1_responses[1]))
print("Bit Error Rate:", bit_error_rate(puf1_responses[0], puf1_responses[1]))
print("Intra-PUF Variation:", intra_puf_variation(puf1_responses))
print("Inter-PUF Variation:", inter_puf_variation(puf_responses))
print("Uniqueness:", uniqueness(puf_responses))
print("Reliability:", reliability(puf1_responses))
print("Avalanche Effect:", avalanche_effect(puf1_responses))
print("Uniformity:", uniformity(puf1_responses[0]))
print("Bit Aliasing:", bit_aliasing(puf1_responses))
print("Correlation Coefficient:", correlation_coefficient(puf_responses))
print("Entropy:", entropy(puf1_responses))
print("Mutual Information:", mutual_information(puf_responses))
print("Min-Entropy:", min_entropy(puf1_responses))

# ---------------------------------------------------------------------------
# 2. Research workflow: population, conditions, full report
# ---------------------------------------------------------------------------
ds = pa.simulate(
    "arbiter", n_devices=32, n_bits=128, n_repeats=4, seed=2024,
    conditions=[("25C", 1.0), ("-40C", 1.8), ("85C", 2.6)],
    stages=64, xor=1, noise=0.06,
)
# For real measurements:  ds = pa.PUFDataset.from_file("measurements.csv")
result = pa.analyze(ds, bootstrap=1000, seed=12345)
print()
print(pa.to_markdown(result))

# Machine-learning attack: 64-stage Arbiter vs 4-XOR Arbiter PUF
for x in (1, 4):
    curve = pa.simulated_attack(stages=64, xor=x, train_sizes=(100, 1000, 5000), test_size=2000, seed=7)
    print("%d-XOR Arbiter PUF, test accuracy:" % x, ["%.3f" % a for a in curve["test_accuracy"]])

# Key generation: smallest fuzzy extractor for a 128-bit key at 1e-6 failure
best = [p for p in pa.plan_key_generation(result["ber"]["mean"], result["entropy"]["min_entropy_mean"], 128, 1e-6)
        if p["feasible"]][0]
print("Best ECC: rep(%d) + %s -> %d PUF bits, failure %.2e" % (best["repetition"], best["code"], best["puf_bits"], best["failure"]))
