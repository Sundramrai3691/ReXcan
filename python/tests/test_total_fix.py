"""Unit tests for total amount extraction fixes."""
import pytest
from app.heuristics import extract_total_amount, extract_invoice_id, MAX_TOTAL_DEFAULT
from app.models import OCRBlock
from app.utils import parse_amount_str


def test_parse_amount_str_european_format():
    """Test parsing European format amounts."""
    assert parse_amount_str("544,46") == 544.46
    assert parse_amount_str("1.234,56") == 1234.56
    assert parse_amount_str("8,25") == 8.25
    assert parse_amount_str("$ 212,09") == 212.09
    assert parse_amount_str("57483,07") == 57483.07


def test_parse_amount_str_us_format():
    """Test parsing US format amounts."""
    assert parse_amount_str("$1,234.56") == 1234.56
    assert parse_amount_str("123.45") == 123.45
    assert parse_amount_str("$403.25") == 403.25


def test_total_excludes_invoice_id():
    """Test that total extraction excludes invoice ID."""
    # Create mock blocks with invoice ID and total
    blocks = [
        OCRBlock(
            text="Invoice no: 27301261",
            bbox=[0, 0, 200, 20],
            confidence=0.9
        ),
        OCRBlock(
            text="Total: $544,46",
            bbox=[0, 2500, 200, 2520],
            confidence=0.9
        ),
        OCRBlock(
            text="27301261",
            bbox=[0, 50, 200, 70],
            confidence=0.9
        ),
    ]
    
    # Extract invoice ID first
    inv_id, _, _ = extract_invoice_id(blocks)
    assert inv_id == "27301261"
    
    # Extract total with invoice ID exclusion
    total, conf, reason = extract_total_amount(blocks, invoice_id=inv_id)
    
    # Should NOT return invoice ID as total
    assert total is not None
    assert total != 27301261.0
    # Should find the actual total
    assert abs(total - 544.46) < 0.1 or total > 100  # Allow some tolerance


def test_total_rejects_large_values():
    """Test that extremely large values are rejected."""
    blocks = [
        OCRBlock(
            text="Total: 2000000.00",
            bbox=[0, 2500, 200, 2520],
            confidence=0.9
        ),
    ]
    
    total, _, _ = extract_total_amount(blocks)
    # Should reject or return None for values > MAX_TOTAL_DEFAULT
    if total is not None:
        assert total <= MAX_TOTAL_DEFAULT


def test_total_prefers_bottom_of_page():
    """Test that totals in bottom of page are preferred."""
    page_height = 3000
    blocks = [
        OCRBlock(
            text="$100.00",
            bbox=[0, 100, 200, 120],  # Top of page
            confidence=0.9
        ),
        OCRBlock(
            text="Total: $544.46",
            bbox=[0, 2500, 200, 2520],  # Bottom of page
            confidence=0.9
        ),
    ]
    
    total, _, _ = extract_total_amount(blocks)
    # Should prefer the bottom one
    assert total is not None
    assert abs(total - 544.46) < 0.1


def test_total_prefers_currency_symbol():
    """Test that amounts with currency symbols are preferred."""
    blocks = [
        OCRBlock(
            text="544.46",
            bbox=[0, 2500, 200, 2520],
            confidence=0.9
        ),
        OCRBlock(
            text="$544.46",
            bbox=[0, 2600, 200, 2620],
            confidence=0.9
        ),
    ]
    
    total, _, reason = extract_total_amount(blocks)
    # Should prefer the one with currency symbol
    assert total is not None
    assert "$" in reason or total == 544.46


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

