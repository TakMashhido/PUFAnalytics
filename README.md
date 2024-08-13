# PUFAnalytics [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.13284761.svg)](https://doi.org/10.5281/zenodo.13284761)

PUFAnalytics is a Python library for comprehensive evaluation and analysis of Physically Unclonable Functions (PUFs). This repository provides implementations for calculating critical PUF metrics including Intra-PUF Variation, Inter-PUF Variation, Uniqueness, Reliability, Avalanche Effect, Uniformity, and additional advanced metrics for deeper analysis. These metrics are essential for assessing the performance, security, and robustness of PUF instances under varying conditions. Whether you're conducting academic research or developing secure hardware, PUFAnalytics offers a reliable and scientifically accurate way to measure PUF characteristics.

## Key Features

- **Hamming Distance**: Hamming Distance measures the number of differing bits between two binary strings of equal length.
- **Bit Error Rate**: The Bit Error Rate (BER) measures the ratio of erroneous bits to the total number of bits in a sequence.
- **Intra-PUF Variation**: Measures the variation in the same PUF's response under different conditions.
- **Inter-PUF Variation**: Measures the difference between different PUF instances' responses.
- **Uniqueness**: Determines how distinct responses are across different PUF instances.
- **Reliability**: Evaluates the consistency of a PUF's response under varied conditions.
- **Avalanche Effect**: Assesses the sensitivity of the PUF to changes in input challenges.
- **Uniformity**: Measures the balance of 1s and 0s in a single PUF response.
- **Bit Aliasing**: Computes the probability of each bit being '1' across all PUF responses.
- **Correlation Coefficient**: Measures the similarity between PUF responses.
- **Entropy**: Measures the randomness or uncertainty in the PUF responses.
- **Mutual Information**: Measures the amount of shared information between pairs of PUF responses.
- **Min-Entropy**: Measures the unpredictability of the most likely outcome in the PUF responses.

## Installation

To install the PUFAnalytics library, follow these steps:


```bash
git clone https://github.com/TakMashhido/PUFAnalytics.git
cd PUFAnalytics
pip install .
```

## Basic Usage

Once you have installed PUFAnalytics, you can start using it to analyze PUF data. For a quick overview and to see how to use the library, refer to the [example file](https://github.com/TakMashhido/PUFAnalytics/example.py). This file provides practical examples and demonstrates the usage of the library functions with sample data.


## PUFAnalytics Formulas

This section covered detailed explanations and formulas for calculating various PUF metrics in the PUFAnalytics library. Each metric is important for assessing different aspects of Physically Unclonable Functions (PUFs) and their performance in hardware security applications.

### 1. Hamming Distance

**Description**: Hamming Distance measures the number of differing bits between two binary strings of equal length. It is used to quantify the difference between two sequences and is a fundamental metric in error detection and correction.

**Formula**:


$$\text{Hamming Distance}(\text{seq1}, \text{seq2}) = \sum_{i=1}^{n} \text{seq1}_i \neq \text{seq2}_i$$


**Explanation**:
- **seq1** and **seq2**: Two binary strings of equal length.
- The formula counts the number of positions where the bits in `seq1` and `seq2` differ.

---

### 2. Bit Error Rate

**Description**: The Bit Error Rate (BER) measures the ratio of erroneous bits to the total number of bits in a sequence. It is used to evaluate the error performance in communication systems or storage devices, reflecting the percentage of bits that were incorrectly received or recorded compared to the total bits transmitted.

**Formula**:

$$\text{Bit Error Rate} = \frac{\text{Number of Errors}}{\text{Total Number of Bits}}$$

**Explanation**:
- **Number of Errors**: The count of differing bits between the expected and actual sequences.
- **Total Number of Bits**: The length of the binary sequence.

The formula calculates the proportion of bits that are incorrect, providing an indication of the quality or reliability of the communication or storage system.

---

### 3. Intra-PUF Variation

**Description**: Intra-PUF Variation measures the variability in responses from the same PUF instance when subjected to different conditions. This metric helps in evaluating the stability of a PUF's response under changing environmental or operational factors.

**Formula**:


$$\text{Intra-PUF Variation} = \frac{\sum_{i=1}^{n-1} \sum_{j=i+1}^{n} \text{Hamming Distance}(\text{Response}_i, \text{Response}_j)}{\text{Number of comparisons}}$$

**Explanation**:
- **Hamming Distance**: The number of differing bits between two binary strings.
- **Responses**: A list of response strings from the same PUF instance under different conditions.
- **Number of comparisons**: Total number of unique pairs of responses compared.

The formula calculates the average Hamming Distance between all pairs of responses from the same PUF, which reflects the variation in responses.

---

### 4. Inter-PUF Variation

**Description**: Inter-PUF Variation assesses the difference in responses between different PUF instances. This metric is useful for understanding how distinct responses are across various PUFs, which indicates the uniqueness of each PUF instance.

**Formula**:


$$\text{Inter-PUF Variation} = \frac{\sum_{i=1}^{m-1} \sum_{j=i+1}^{m} \text{Hamming Distance}(\text{PUF}_i, \text{PUF}_j)}{\text{Number of comparisons}}$$

**Explanation**:
- **PUF**: Different instances of PUFs being compared.
- **Number of comparisons**: Total number of unique pairs of PUFs compared.

The formula computes the average Hamming Distance between all pairs of responses from different PUF instances, providing a measure of how distinct the PUF instances are from each other.

---

### 5. Uniqueness

**Description**: Uniqueness quantifies how different the responses are across various PUF instances. A higher uniqueness value indicates that responses are more distinct and less likely to be duplicated across different PUFs.

**Formula**:

$$
\text{Uniqueness} = \frac{2 \times \sum_{i=1}^{m-1} \sum_{j=i+1}^{m} \text{Hamming Distance}(\text{PUF}_i, \text{PUF}_j)}{\text{Number of comparisons} \times \text{Response Length}}
$$

**Explanation**:
- **Response Length**: Length of each response string in bits.
- **Number of comparisons**: Total number of unique pairs of PUFs compared.

The formula calculates the average normalized Hamming Distance between all pairs of responses from different PUF instances. The result is multiplied by 2 to account for the pairwise comparison being double-counted.

---

### 6. Reliability

**Description**: Reliability measures the consistency of a PUF's response under varied conditions. It indicates how stable a PUF's output is when the conditions (e.g., temperature, voltage) change.

**Formula**:

$$
\text{Reliability} = 1 - \frac{\sum_{i=1}^{n-1} \text{Hamming Distance}(\text{Reference Response}, \text{Response}_i)}{(n-1) \times \text{Response Length}}
$$

**Explanation**:
- **Reference Response**: The initial response used as a baseline for comparison.
- **Number of responses**: Total number of responses compared to the reference.

The formula calculates the average Hamming Distance between the reference response and other responses, normalized by the response length and number of comparisons. A higher reliability value indicates more consistent responses.

---

### 7. Avalanche Effect

**Description**: Avalanche Effect measures how much a change in input affects the output of a PUF. A high avalanche effect implies that a small change in the input leads to a significant change in the output, which is desirable for security.

**Formula**:

$$
\text{Avalanche Effect} = \frac{\sum_{i=1}^{n-1} \sum_{j=i+1}^{n} \text{Hamming Distance}(\text{Response}_i, \text{Response}_j)}{\text{Number of comparisons} \times \text{Response Length}}
$$

**Explanation**:
- **Number of comparisons**: Total number of unique pairs of responses compared.
- **Response Length**: Length of each response string in bits.

The formula calculates the average normalized Hamming Distance between all pairs of responses, reflecting the effect of input changes on output.

---

### 8. Uniformity

**Description**: Uniformity measures the balance of 1s and 0s in a single PUF response. A uniform response has an approximately equal number of 1s and 0s, which is important for ensuring that the PUF output is unpredictable and evenly distributed.

**Formula**:

$$
\text{Uniformity} = \left(\frac{\text{Number of 1s in Response}}{\text{Response Length}}\right) \times 100
$$

**Explanation**:
- **Number of 1s in Response**: Count of bits set to 1 in the response string.
- **Response Length**: Total number of bits in the response string.

The formula calculates the percentage of 1s in the response, which gives an indication of how balanced the output is.

---

### 9. Bit Aliasing

**Description**: Bit Aliasing measures the probability of each bit being '1' across all PUF responses. This metric helps in understanding the bias towards '1' in individual bit positions, which can indicate a lack of uniformity in the PUF responses.

**Formula**:

$$\text{Bit Aliasing}(i) = \frac{\text{Number of 1s at bit position } i}{\text{Total number of responses}}$$

**Explanation**:
- **Number of 1s at bit position i**: The count of responses where the bit at position `i` is '1'.
- **Total number of responses**: The total number of PUF responses analyzed.

The formula computes the probability that a specific bit position in the PUF response is '1' across all responses. This metric provides insights into how often a bit position is biased towards '1', indicating a potential issue in the randomness of the PUF.

---

### 10. Correlation Coefficient

**Description**: The Correlation Coefficient measures the similarity between PUF responses. It indicates how strongly the bits of different PUF responses are correlated, which is crucial for understanding response patterns and potential dependencies between bits.

**Formula**:

$$\text{Correlation Coefficient} = \frac{\sum_{i=1}^{n-1} \sum_{j=i+1}^{n} \sum_{k=1}^{L} \text{(Response1}_k = \text{Response2}_k)}{\text{Total number of comparisons} \times \text{Length of response}}$$

**Explanation**:
- **Response1_k** and **Response2_k**: Bits at position `k` in two different PUF responses being compared.
- **Total number of comparisons**: Total number of unique pairs of PUF responses compared.
- **Length of response**: The length of each PUF response in bits.

The formula calculates the average number of matching bits between all pairs of PUF responses. A high correlation coefficient suggests that the PUF responses are similar, indicating potential predictability, which might reduce the security of the PUF.

---

### 11. Entropy

**Description**: Entropy measures the randomness or uncertainty in the PUF responses. It quantifies the unpredictability of the PUF responses, with higher entropy values indicating more randomness and better security.

**Formula**:

$$\text{Entropy} = -\sum_{i=1}^{L} \sum_{b \in \{0,1\}} P(b) \log_2 P(b)$$

**Explanation**:
- **L**: The length of the PUF response in bits.
- **P(b)**: The probability of bit `b` (either '0' or '1') occurring at each bit position across all responses.

The formula computes the average entropy across all bit positions, reflecting the degree of randomness in the PUF responses. Higher entropy values suggest more randomness and therefore better security characteristics of the PUF.

---

### 12. Mutual Information

**Description**: Mutual Information measures the amount of shared information between pairs of PUF responses. It quantifies the dependencies between different bit positions within the PUF responses, which is important for understanding potential correlations and vulnerabilities in the PUF.

**Formula**:

$$\text{Mutual Information} = \sum_{i=1}^{L-1} \sum_{j=i+1}^{L} \sum_{b_1, b_2 \in \{0,1\}} P(b_1, b_2) \log_2 \frac{P(b_1, b_2)}{P(b_1)P(b_2)}$$

**Explanation**:
- **P(b1, b2)**: The joint probability of bit `b1` occurring at position `i` and bit `b2` occurring at position `j` in the PUF responses.
- **P(b1)** and **P(b2)**: The individual probabilities of bit `b1` at position `i` and bit `b2` at position `j`, respectively.

The formula calculates the mutual information between all pairs of bit positions in the PUF responses, reflecting how much knowing the value of one bit reduces the uncertainty about the value of another bit. Higher mutual information suggests greater dependency between bits, which can reduce the effectiveness of the PUF.

---

### 13. Min-Entropy

**Description**: Min-Entropy measures the unpredictability of the most likely outcome in the PUF responses. It provides a worst-case estimate of randomness, focusing on the most predictable bit positions in the PUF responses.

**Formula**:

$$\text{Min-Entropy} = -\log_2 \left(\max\left\{P(b) \text{ for } b \in \{0, 1\} \right\}\right)$$

**Explanation**:
- **P(b)**: The probability of the most frequent bit value (either '0' or '1') occurring at each bit position.

The formula calculates the minimum entropy across all bit positions, representing the worst-case scenario in terms of predictability. Lower min-entropy values indicate that certain bit positions are more predictable, which can compromise the security provided by the PUF.


## Citation
If you are using this library, please cite it using the following citation:
```
@software{Koustav_Kumar_PUFAnalytics_Python_library_2024,
author = {Koustav Kumar, Mondal},
doi = {10.5281/zenodo.13284761},
month = aug,
title = {{PUFAnalytics: Python library for comprehensive evaluation and analysis of Physically Unclonable Functions (PUFs)}},
url = {https://github.com/TakMashhido/PUFAnalytics},
version = {1.0.0},
year = {2024}
}
```