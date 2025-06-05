import pytest
from pufanalytics.metrics import hamming_distance, bit_error_rate, bit_aliasing


def test_hamming_distance_simple():
    assert hamming_distance('11001010', '11001011') == 1


def test_bit_error_rate_simple():
    assert bit_error_rate('11001010', '11001011') == 1 / 8


def test_bit_aliasing_example():
    responses = [
        '11001010',
        '11001011',
        '11011010',
    ]
    expected = [1.0, 1.0, 0.0, 1/3, 1.0, 0.0, 1.0, 1/3]
    result = bit_aliasing(responses)
    assert result == pytest.approx(expected)

