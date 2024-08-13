import math
from collections import Counter
from itertools import combinations

def hamming_distance(seq1, seq2):
    """
    Compute the Hamming distance between two sequences of equal length.
    
    Parameters:
    seq1 (str): First sequence.
    seq2 (str): Second sequence.
    
    Returns:
    int: The Hamming distance between the sequences.
    """
    if len(seq1) != len(seq2):
        raise ValueError("Sequences must be of equal length")
    return sum(c1 != c2 for c1, c2 in zip(seq1, seq2))

def bit_error_rate(expected, actual):
    """
    Compute the bit error rate between two sequences of equal length.
    
    Parameters:
    expected (str): Expected sequence.
    actual (str): Actual sequence.
    
    Returns:
    float: The bit error rate.
    """
    if len(expected) != len(actual):
        raise ValueError("Sequences must be of equal length")
    errors = hamming_distance(expected, actual)
    return errors / len(expected)

def intra_puf_variation(responses):
    """
    Compute the intra-PUF variation.
    
    Parameters:
    responses (list of str): List of PUF responses.
    
    Returns:
    float: The intra-PUF variation.
    """
    n = len(responses)
    if n < 2:
        raise ValueError("At least two responses are required")
    
    total_hd = 0
    count = 0
    for i in range(n):
        for j in range(i+1, n):
            total_hd += hamming_distance(responses[i], responses[j])
            count += 1
    return total_hd / count

def inter_puf_variation(puf_responses):
    """
    Compute the inter-PUF variation.
    
    Parameters:
    puf_responses (list of list of str): List of lists, each containing PUF responses from different PUFs.
    
    Returns:
    float: The inter-PUF variation.
    """
    m = len(puf_responses)
    if m < 2:
        raise ValueError("At least two PUF responses are required")
    
    total_hd = 0
    count = 0
    for i in range(m):
        for j in range(i+1, m):
            total_hd += hamming_distance(puf_responses[i], puf_responses[j])
            count += 1
    return total_hd / count

def uniqueness(puf_responses):
    """
    Compute the uniqueness metric for a list of PUF responses.
    
    Parameters:
    puf_responses (list of str): List of PUF responses.
    
    Returns:
    float: The uniqueness metric.
    """
    m = len(puf_responses)
    if m < 2:
        raise ValueError("At least two PUF responses are required")
    
    total_hd = 0
    count = 0
    for i in range(m):
        for j in range(i+1, m):
            total_hd += hamming_distance(puf_responses[i], puf_responses[j])
            count += 1
    n = len(puf_responses[0])  # Assume all responses have the same length
    return (2 * total_hd) / (count * n)

def reliability(responses):
    """
    Compute the reliability of a list of PUF responses.
    
    Parameters:
    responses (list of str): List of PUF responses.
    
    Returns:
    float: The reliability metric.
    """
    n = len(responses)
    if n < 2:
        raise ValueError("At least two responses are required")
    
    ref_response = responses[0]  # Use the first response as the reference
    total_hd = 0
    for i in range(1, n):
        total_hd += hamming_distance(ref_response, responses[i])
    
    n_bits = len(ref_response)
    return 1 - (total_hd / ((n - 1) * n_bits))

def avalanche_effect(responses):
    """
    Compute the avalanche effect for a list of PUF responses.
    
    Parameters:
    responses (list of str): List of PUF responses.
    
    Returns:
    float: The avalanche effect metric.
    """
    n = len(responses)
    if n < 2:
        raise ValueError("At least two responses are required")
    
    total_hd = 0
    count = 0
    for i in range(n):
        for j in range(i+1, n):
            total_hd += hamming_distance(responses[i], responses[j])
            count += 1
    n_bits = len(responses[0])
    return total_hd / (count * n_bits)

def uniformity(response):
    """
    Compute the uniformity of a single PUF response.
    
    Parameters:
    response (str): A PUF response.
    
    Returns:
    float: The uniformity of the response.
    """
    n_bits = len(response)
    num_ones = response.count('1')
    return (num_ones / n_bits) * 100

def bit_aliasing(response):
    """
    Compute the bit aliasing for a list of PUF responses.
    
    Parameters:
    response (list of str): List of PUF responses.
    
    Returns:
    list of float: The bit aliasing metric for each bit position.
    """
    n_responses = len(response)
    n_bits = len(response[0])
    
    bit_aliasing_result = []
    for i in range(n_bits):
        bit_values = [response[i] for response in response]
        num_ones = bit_values.count('1')
        bit_aliasing_result.append(num_ones / n_responses)
    
    return bit_aliasing_result

def correlation_coefficient(response):
    """
    Compute the correlation coefficient between PUF responses.
    
    Parameters:
    response (list of str): List of PUF responses.
    
    Returns:
    float: The correlation coefficient.
    """
    n = len(response)
    if n < 2:
        raise ValueError("At least two PUF responses are required")
    
    total_correlation = 0
    count = 0
    
    for response1, response2 in combinations(response, 2):
        total_correlation += sum(c1 == c2 for c1, c2 in zip(response1, response2))
        count += 1
    
    n_bits = len(response[0])
    return total_correlation / (count * n_bits)

def entropy(puf_responses):
    """
    Compute the entropy of a list of PUF responses.
    
    Parameters:
    puf_responses (list of str): List of PUF responses.
    
    Returns:
    float: The entropy of the responses.
    """
    n_responses = len(puf_responses)
    n_bits = len(puf_responses[0])
    
    total_entropy = 0
    for i in range(n_bits):
        bit_values = [response[i] for response in puf_responses]
        count = Counter(bit_values)
        probabilities = [count[bit] / n_responses for bit in count]
        total_entropy += -sum(p * math.log2(p) for p in probabilities)
    
    return total_entropy / n_bits

def mutual_information(puf_responses):
    """
    Compute the mutual information between PUF responses.
    
    Parameters:
    puf_responses (list of str): List of PUF responses.
    
    Returns:
    float: The mutual information metric.
    """
    n = len(puf_responses)
    if n < 2:
        raise ValueError("At least two PUF responses are required")
    
    n_bits = len(puf_responses[0])
    total_mutual_info = 0
    
    for i in range(n_bits):
        count1 = Counter([response[i] for response in puf_responses])
        p1_prob = {bit: count1[bit] / n for bit in count1}

        for j in range(i+1, n_bits):
            count2 = Counter([response[j] for response in puf_responses])
            p2_prob = {bit: count2[bit] / n for bit in count2}

            joint_count = Counter((response[i], response[j]) for response in puf_responses)
            joint_prob = {(bit1, bit2): joint_count[(bit1, bit2)] / n for bit1, bit2 in joint_count}
            
            for (bit1, bit2), joint_p in joint_prob.items():
                if joint_p > 0:
                    total_mutual_info += joint_p * math.log2(joint_p / (p1_prob[bit1] * p2_prob[bit2]))

    return total_mutual_info / (n_bits * (n_bits - 1) / 2)

def min_entropy(puf_responses):
    """
    Compute the min-entropy of a list of PUF responses.
    
    Parameters:
    puf_responses (list of str): List of PUF responses.
    
    Returns:
    float: The min-entropy of the responses.
    """
    n_responses = len(puf_responses)
    n_bits = len(puf_responses[0])
    
    min_entropy_values = []
    for i in range(n_bits):
        bit_values = [response[i] for response in puf_responses]
        count = Counter(bit_values)
        max_probability = max(count.values()) / n_responses
        min_entropy_values.append(-math.log2(max_probability))
    
    return sum(min_entropy_values) / n_bits