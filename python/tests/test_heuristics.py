"""Unit tests for heuristics."""
import pytest
from app.models import OCRBlock
from app.heuristics import (
    extract_invoice_id, extract_date, extract_total_amount,
    extract_currency, extract_vendor_name
)


def test_extract_invoice_id():
    """Test invoice ID extraction."""
    blocks = [
        OCRBlock(
            text="Invoice No: 12345678",
            bbox=[100, 100, 300, 120],
            confidence=0.9,
            engine="pdfplumber"
        ),
        OCRBlock(
            text="Total: $100.00",
            bbox=[100, 500, 300, 520],
            confidence=0.9,
            engine="pdfplumber"
        )
    ]
    
    result = extract_invoice_id(blocks)
    assert result[0] == "12345678" or "12345678" in result[0]
    assert result[1] > 0.5  # Confidence


def test_extract_total_amount():
    """Test total amount extraction."""
    blocks = [
        OCRBlock(
            text="Total: $212.09",
            bbox=[100, 500, 300, 520],
            confidence=0.9,
            engine="pdfplumber"
        ),
        OCRBlock(
            text="Invoice No: 61356291",
            bbox=[100, 100, 300, 120],
            confidence=0.9,
            engine="pdfplumber"
        )
    ]
    
    result = extract_total_amount(blocks, invoice_id="61356291")
    assert result[0] is not None
    assert result[0] > 0
    # Should not pick invoice ID
    assert abs(result[0] - 212.09) < 0.01 or result[0] != 61356291.0


def test_extract_date():
    """Test date extraction."""
    blocks = [
        OCRBlock(
            text="Invoice Date: 10/15/2012",
            bbox=[100, 150, 300, 170],
            confidence=0.9,
            engine="pdfplumber"
        )
    ]
    
    result = extract_date(blocks, "invoice")
    assert result[0] is not None
    assert "2012" in result[0] or "10" in result[0]


def test_extract_currency():
    """Test currency extraction."""
    blocks = [
        OCRBlock(
            text="Total: $212.09",
            bbox=[100, 500, 300, 520],
            confidence=0.9,
            engine="pdfplumber"
        )
    ]
    
    result = extract_currency(blocks, total_amount=212.09)
    assert result[0] == "USD"
    assert result[1] > 0.5


def test_extract_vendor_name():
    """Test vendor name extraction."""
    blocks = [
        OCRBlock(
            text="Patel, Thompson and Company",
            bbox=[50, 50, 400, 70],
            confidence=0.9,
            engine="pdfplumber"
        )
    ]
    
    result = extract_vendor_name(blocks)
    assert result[0] is not None
    assert len(result[0]) > 0
