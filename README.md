# PUFAnalytics

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
