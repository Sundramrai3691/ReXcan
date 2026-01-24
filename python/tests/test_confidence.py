"""Unit tests for confidence scoring."""
import pytest
from app.models import OCRBlock
from app.confidence import compute_field_confidence, should_use_llm


def test_compute_field_confidence():
    """Test confidence computation."""
    blocks = [
        OCRBlock(
            text="Invoice No: 12345678",
            bbox=[100, 100, 300, 120],
            confidence=0.9,
            engine="pdfplumber"
        )
    ]
    
    result = ("12345678", 0.85, "strict regex match")
    conf, reason = compute_field_confidence("invoice_id", "12345678", blocks, result)
    
    assert 0.0 <= conf <= 1.0
    assert reason is not None


def test_should_use_llm():
    """Test LLM trigger logic."""
    # Low confidence should trigger LLM
    should, reason = should_use_llm(0.3, "invoice_id", True, None, False)
    assert should is True
    assert "low_conf" in reason
    
    # Missing field should trigger LLM
    should, reason = should_use_llm(0.0, "invoice_id", True, None, True)
    assert should is True
    assert "missing" in reason
    
    # High confidence should not trigger LLM
    should, reason = should_use_llm(0.9, "invoice_id", True, None, False)
    assert should is False

