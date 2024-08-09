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
