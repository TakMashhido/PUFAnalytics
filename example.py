from pufanalytics import intra_puf_variation, inter_puf_variation, uniqueness, reliability, avalanche_effect, uniformity, hamming_distance, bit_error_rate, bit_aliasing, entropy, mutual_information, correlation_coefficient, min_entropy

# Sample PUF responses for the same PUF under different conditions
puf1_responses = [
    "11001010",  # Response under normal condition
    "11001011",  # Response under slightly varied condition
    "11011010",  # Response under another condition
]

# Sample PUF responses from different PUF instances under the same condition
puf_responses = [
    "11001010",  # Response from PUF 1
    "10101010",  # Response from PUF 2
    "11101010",  # Response from PUF 3
]

# Hamming Distance between two responses
hd = hamming_distance(puf1_responses[0], puf1_responses[1])
print("Hamming Distance:", hd)

# Bit Error Rate
ber = bit_error_rate(puf1_responses[0], puf1_responses[1])
print("Bit Error Rate:", ber)

# Intra-PUF Variation
intra_var = intra_puf_variation(puf1_responses)
print("Intra-PUF Variation:", intra_var)

# Inter-PUF Variation
inter_var = inter_puf_variation(puf_responses)
print("Inter-PUF Variation:", inter_var)

# Uniqueness
unique = uniqueness(puf_responses)
print("Uniqueness:", unique)

# Reliability
rel = reliability(puf1_responses)
print("Reliability:", rel)

# Avalanche Effect
avalanche = avalanche_effect(puf1_responses)
print("Avalanche Effect:", avalanche)

# Uniformity
uni = uniformity(puf1_responses[0])
print("Uniformity:", uni)

#Bit Aliasing
ba = bit_aliasing(puf1_responses)
print("Bit Aliasing:", ba)

#Correlation Coefficient
cc = correlation_coefficient(puf_responses)
print("Correlation Coefficient:", cc)

#Entropy
en = entropy(puf1_responses)
print("Entropy:", en)

#Mutual Information
mi = mutual_information(puf_responses)
print("Mutual Information:", mi)

#Min-Entropy
me = min_entropy(puf1_responses)
print("Min-Entropy:", me)