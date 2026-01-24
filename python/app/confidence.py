"""Confidence scoring for extracted fields."""
from typing import Dict, List, Optional, Tuple, Any
from app.models import OCRBlock


def compute_confidence(ocr_c: float, label_score: float, regex_score: float, 
                      llm_agree: bool = False) -> float:
    """Compute field confidence using exact formula.
    
    Formula: base + 0.7 * min(ocr_c, label_score, regex_score) + (0.1 if llm_agree else 0.0)
    
    Args:
        ocr_c: Average OCR token confidence (0..1)
        label_score: Label match score (1.0 exact, 0.8 fuzzy, 0.5 positional)
        regex_score: Regex match score (1.0 exact, 0.6 partial, 0.0 none)
        llm_agree: Whether LLM result agrees with heuristic
    
    Returns:
        Confidence score (0..1)
    """
    base = 0.2
    final = base + 0.7 * min(ocr_c, label_score, regex_score) + (0.1 if llm_agree else 0.0)
    return max(0.0, min(1.0, final))


def get_ocr_confidence_for_text(blocks: List[OCRBlock], text: Any) -> float:
    """Get average OCR confidence for blocks containing the text.
    
    Args:
        blocks: OCR blocks
        text: Text to find (can be string, float, or None)
    
    Returns:
        Average confidence (0..1)
    """
    if text is None:
        return 0.0
    
    # Convert to string
    text_str = str(text).strip()
    if not text_str:
        return 0.0
    
    matching_blocks = [b for b in blocks if text_str.lower() in b.text.lower()]
    
    if not matching_blocks:
        return 0.5  # Default if not found
    
    return sum(b.confidence for b in matching_blocks) / len(matching_blocks)


def compute_field_confidence(field_name: str, field_value: Optional[str], 
                            blocks: List[OCRBlock],
                            heuristic_result: Tuple[Optional[str], float, str],
                            llm_agree: bool = False) -> Tuple[float, str]:
    """Compute confidence for a specific field using sub-scores.
    
    Args:
        field_name: Name of the field
        field_value: Extracted value
        blocks: OCR blocks
        heuristic_result: (value, heuristic_confidence, reason) from heuristics
        llm_agree: Whether LLM agrees with heuristic
    
    Returns:
        (confidence, reason)
    """
    if field_value is None:
        return 0.0, "Field not found"
    
    # Get OCR confidence
    ocr_c = get_ocr_confidence_for_text(blocks, field_value)
    
    # Extract heuristic confidence and reason
    heuristic_conf, reason = heuristic_result[1], heuristic_result[2]
    
    # Determine label_score and regex_score from reason and heuristic confidence
    # Parse reason to extract method: "strict regex", "relaxed regex", "label", "heuristic"
    reason_lower = reason.lower()
    
    # Use heuristic confidence directly to inform sub-scores
    if "strict regex" in reason_lower or "strict" in reason_lower:
        regex_score = 1.0
        label_score = 1.0 if "label" in reason_lower else min(0.7, heuristic_conf)
    elif "relaxed regex" in reason_lower or "relaxed" in reason_lower:
        regex_score = 0.6
        label_score = 0.4
    elif "label" in reason_lower:
        label_score = min(1.0, heuristic_conf)
        regex_score = min(0.8, heuristic_conf * 0.9)
    elif "pattern" in reason_lower or "found" in reason_lower:
        label_score = 0.4
        regex_score = min(0.7, heuristic_conf)
    elif "heuristic" in reason_lower:
        label_score = 0.3
        regex_score = 0.3
    else:
        # Default: use heuristic confidence to inform scores
        label_score = min(0.5, heuristic_conf * 0.6)
        regex_score = min(0.5, heuristic_conf * 0.7)
    
    # Special rule: if regex_score == 1.0 and ocr_conf >= 0.75 → auto-accept
    if regex_score == 1.0 and ocr_c >= 0.75:
        # Boost confidence
        final_conf = compute_confidence(ocr_c, label_score, regex_score, llm_agree)
        if final_conf >= 0.85:
            return final_conf, reason + " (auto-accept: strict regex + high OCR)"
    
    # Compute final confidence using exact formula
    conf = compute_confidence(ocr_c, label_score, regex_score, llm_agree)
    
    return conf, reason


def should_use_llm(confidence: float, field_name: str, is_required: bool = True, 
                  timings: Optional[Dict[str, float]] = None, field_missing: bool = False) -> Tuple[bool, str]:
    """Determine if LLM fallback should be used with reason.
    
    LLM Trigger Policy:
    - final_conf < 0.5 for required field (always)
    - field is missing (always)
    - ocr + heuristics > 10s AND confidence < 0.85 (time-based fallback)
    
    Args:
        confidence: Field confidence score
        field_name: Name of the field
        is_required: Whether field is required
        timings: Optional dict with 'ocr' and 'heuristics' timing
        field_missing: Whether field value is None/empty
    
    Returns:
        (should_call_llm, reason)
    """
    # Immediate reasons
    if field_missing and is_required:
        return True, "missing_field"
    
    if confidence < 0.5 and is_required:
        return True, "low_conf"
    
    # Time-based rule: heuristics took too long for required fields
    if timings and is_required:
        ocr_time = timings.get("ocr", 0) or timings.get("extraction", 0)
        heur_time = timings.get("heuristics", 0)
        total_time = ocr_time + heur_time
        
        if total_time > 10.0 and confidence < 0.85:
            return True, "slow_pipeline"
    
    return False, ""


def get_confidence_badge(confidence: float) -> str:
    """Get confidence badge label.
    
    Args:
        confidence: Confidence score (0..1)
    
    Returns:
        Badge label: 'auto-accept', 'flag', or 'llm-required'
    """
    if confidence >= 0.85:
        return "auto-accept"
    elif confidence >= 0.5:
        return "flag"
    else:
        return "llm-required"

