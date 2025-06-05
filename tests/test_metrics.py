import os
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from pufanalytics import bit_aliasing


def test_bit_aliasing_basic():
    responses = [
        '0101',
        '1101',
        '0000',
        '1111'
    ]
    expected = [
        (0 + 1 + 0 + 1) / 4,  # bit0: 0,1,0,1 -> 2 ones => 0.5
        (1 + 1 + 0 + 1) / 4,  # bit1: 1,1,0,1 -> 3 ones => 0.75
        (0 + 0 + 0 + 1) / 4,  # bit2: 0,0,0,1 -> 1 one  => 0.25
        (1 + 1 + 0 + 1) / 4   # bit3: 1,1,0,1 -> 3 ones => 0.75
    ]
    # But we can't express as above; we will compute easily using counts
    assert bit_aliasing(responses) == [0.5, 0.75, 0.25, 0.75]


def test_bit_aliasing_empty():
    with pytest.raises(ValueError):
        bit_aliasing([])


def test_bit_aliasing_mismatched_length():
    responses = ['01', '001']
    with pytest.raises(ValueError):
        bit_aliasing(responses)
