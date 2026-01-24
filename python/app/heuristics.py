"""Heuristic field extractors for invoice data."""
import re
from typing import List, Optional, Tuple, Dict
from datetime import datetime
from dateutil import parser as date_parser
from app.models import OCRBlock
from app.utils import (
    normalize_text, label_matches, find_candidate_near,
    parse_amount_str, normalize_vendor_name
)

# Configuration constants for total amount extraction
MAX_TOTAL_DEFAULT = 1_000_000.0     # reject amounts greater than this as likely non-total
BOTTOM_PAGE_RATIO = 0.40            # prefer candidates in bottom 40% of page
MIN_TOTAL_PLAUSIBLE = 0.001         # reject near-zero like 0 or 0.0 if suspicious (lowered for small invoices)
PREFER_CURRENCY_SYMBOL = True       # prefer candidates with currency symbol


# Invoice ID labels (for token-level matching)
INVOICE_ID_LABELS = [
    "invoice number", "invoice no", "invoice #", "inv no", "inv #",
    "invoice id", "invoice num", "doc no", "document no",
    "numero factura", "numero fatura",  # Portuguese/Spanish
    "facture numero",  # French
]

# Strict invoice ID regex (high confidence patterns)
INVOICE_ID_STRICT = re.compile(
    r"\b(?:INV(?:O?ICE)?[-\s#:]*\d{2,}|\b[A-Z]{2,4}[-\/]\d{2,6}\b|\b[A-Z0-9]{5,}\b)",
    re.IGNORECASE
)

# Relaxed invoice ID regex (lower confidence, fallback)
INVOICE_ID_RELAXED = re.compile(
    r"\b[A-Z0-9][A-Z0-9\-\_\/]{4,}\b",
    re.IGNORECASE
)

# Date patterns (comprehensive)
DATE_PATTERNS = [
    r"\d{4}-\d{2}-\d{2}",  # YYYY-MM-DD
    r"\d{2}/\d{2}/\d{4}",  # MM/DD/YYYY or DD/MM/YYYY
    r"\d{2}-\d{2}-\d{4}",  # MM-DD-YYYY or DD-MM-YYYY
    r"\d{2}\.\d{2}\.\d{4}",  # DD.MM.YYYY
    r"[A-Z][a-z]{2,9}\s+\d{1,2},?\s+\d{4}",  # Nov 1, 2024 or January 1, 2024
    r"\d{1,2}\s+[A-Z][a-z]{2,9}\s+\d{4}",  # 1 Nov 2024
    r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}",  # 1/23/2019 or 1-23-2019
]

# Total amount labels
TOTAL_LABELS = [
    "total", "amount due", "grand total", "balance due",
    "total geral", "total a pagar",  # Portuguese
    "importe total", "total factura",  # Spanish
]

# Strict amount regex (currency symbols required)
AMOUNT_STRICT = re.compile(
    r"(?:₹|\$|USD|INR|€|EUR|£|GBP|Rs\.?)\s*[-+]?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?",
    re.IGNORECASE
)

# Relaxed amount regex (numeric sequences)
AMOUNT_RELAXED = re.compile(
    r"(?<!\S)([-+]?\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{1,2}))(?!\S)",
    re.IGNORECASE
)

# Vendor name patterns (common company suffixes)
VENDOR_SUFFIXES = [
    r"inc\.?", r"llc\.?", r"ltd\.?", r"corp\.?", r"corporation",
    r"company", r"co\.?", r"llp\.?", r"plc\.?"
]


def find_label_proximity(blocks: List[OCRBlock], label_patterns: List[str], 
                         max_distance: int = 200) -> List[Tuple[OCRBlock, float]]:
    """Find OCR blocks near label patterns using improved label matching.
    
    Args:
        blocks: List of OCR blocks
        label_patterns: List of label strings (not regex, will be token-matched)
        max_distance: Maximum pixel distance to consider
    
    Returns:
        List of (block, distance) tuples sorted by proximity
    """
    candidates = []
    label_blocks = []
    
    # First, find all label blocks using improved matching
    for block in blocks:
        text_norm = normalize_text(block.text)
        
        for label in label_patterns:
            # Use improved label matching (token-level, fuzzy)
            if label_matches(text_norm, label, threshold=80):
                label_blocks.append(block)
                break
    
    # Now find blocks near each label block using geometric proximity
    for label_block in label_blocks:
        # Use geometric proximity function
        candidate = find_candidate_near(label_block, blocks, prefer_right=True, max_px=max_distance)
        if candidate:
            # Compute distance
            l_cx = (label_block.bbox[0] + label_block.bbox[2]) / 2
            l_cy = (label_block.bbox[1] + label_block.bbox[3]) / 2
            c_cx = (candidate.bbox[0] + candidate.bbox[2]) / 2
            c_cy = (candidate.bbox[1] + candidate.bbox[3]) / 2
            distance = ((c_cx - l_cx) ** 2 + (c_cy - l_cy) ** 2) ** 0.5
            candidates.append((candidate, distance))
    
    # Sort by distance
    candidates.sort(key=lambda x: x[1])
    return candidates


def find_blocks_with_label(blocks: List[OCRBlock], labels: List[str]) -> List[OCRBlock]:
    """Find blocks containing labels (whole word matching preferred)."""
    label_blocks = []
    for block in blocks:
        text_norm = normalize_text(block.text).lower()
        text_words = set(text_norm.split())
        for label in labels:
            label_lower = label.lower()
            # Check for whole word match first (more strict)
            if label_lower in text_words:
                label_blocks.append(block)
                break
            # Then check substring match (for multi-word labels like "amount due")
            elif label_lower in text_norm:
                # But require it's not part of a longer word
                import re
                if re.search(r'\b' + re.escape(label_lower) + r'\b', text_norm):
                    label_blocks.append(block)
                    break
            # Finally try fuzzy matching
            elif label_matches(text_norm, label, threshold=75):
                label_blocks.append(block)
                break
    return label_blocks


def extract_invoice_id(blocks: List[OCRBlock]) -> Tuple[Optional[str], float, str]:
    """Extract invoice ID with improved prioritization and strict/relaxed regex.
    
    Returns:
        (value, confidence, reason)
    """
    if not blocks:
        return None, 0.0, "No blocks available"
    
    # Normalize all block texts (store in a dict to avoid modifying blocks)
    block_norms = {}
    for b in blocks:
        if hasattr(b, 'text'):
            block_norms[id(b)] = normalize_text(b.text)
    
    # Find label blocks
    label_blocks = find_blocks_with_label(blocks, INVOICE_ID_LABELS)
    candidates = []
    chosen_block = None
    
    # Strategy 1: Using label anchors -> strict regex right-of/below
    for lb in label_blocks:
        # Check same block first
        lb_norm = normalize_text(lb.text)
        same_block_match = re.search(r'(?:invoice\s*(?:no|number|#|id)[:\s]+)([A-Z0-9\-/]{4,50})', lb_norm, re.IGNORECASE)
        if same_block_match:
            invoice_id = same_block_match.group(1).strip()
            if 4 <= len(invoice_id) <= 50:
                candidates.append(('strict_label', invoice_id, lb, 0.95))
                chosen_block = lb
                break
        
        # Find nearby block
        nb = find_candidate_near(lb, blocks, prefer_right=True, max_px=800)
        if nb:
            s = block_norms.get(id(nb), normalize_text(nb.text))
            m = INVOICE_ID_STRICT.search(s)
            if m:
                cand = m.group(0).strip()
                if 4 <= len(cand) <= 50:
                    candidates.append(('strict_label', cand, nb, 0.90))
                    chosen_block = nb
                    break
            # Relaxed attempt in nearest block (require uppercase-like or digits)
            m2 = INVOICE_ID_RELAXED.search(s)
            if m2 and re.search(r"[A-Z0-9]{3,}", m2.group(0)):
                cand = m2.group(0).strip()
                if len(re.sub(r'\W', '', cand)) >= 5:
                    candidates.append(('relaxed_label', cand, nb, 0.75))
                    chosen_block = nb
                    break
    
    # Strategy 2: Global strict scan
    if not candidates:
        for b in blocks:
            s = block_norms.get(id(b), normalize_text(b.text))
            m = INVOICE_ID_STRICT.search(s)
            if m:
                cand = m.group(0).strip()
                if 4 <= len(cand) <= 50:
                    candidates.append(('strict', cand, b, 0.80))
                    chosen_block = b
                    break
    
    # Strategy 3: Global relaxed + positional filter (top-right preference)
    if not candidates:
        # Top-right heuristic: sort by y (top) then -x (right)
        tr = sorted(blocks, key=lambda x: (x.bbox[1], -x.bbox[0]))[:20]
        for b in tr:
            s = block_norms.get(id(b), normalize_text(b.text))
            m = INVOICE_ID_RELAXED.search(s)
            if m:
                cand = m.group(0).strip()
                # Require at least 3 alnum chars and one digit, length >= 5
                if re.search(r"\d", cand) and len(re.sub(r'\W', '', cand)) >= 5:
                    candidates.append(('relaxed', cand, b, 0.65))
                    chosen_block = b
                    break
    
    if not candidates:
        return None, 0.0, "No invoice ID found"
    
    # Select best candidate
    candidates.sort(key=lambda x: (
        0 if x[0] == 'strict_label' else
        1 if x[0] == 'relaxed_label' else
        2 if x[0] == 'strict' else 3,
        -x[3]  # Then by confidence
    ))
    best = candidates[0]
    
    # Compute confidence
    ocr_c = chosen_block.confidence if chosen_block else 0.5
    label_score = 1.0 if label_blocks else 0.5
    regex_score = 1.0 if best[0] in ['strict_label', 'strict'] else 0.6
    
    # Base confidence formula
    confidence = 0.2 + 0.7 * min(ocr_c, label_score, regex_score)
    confidence = max(0.0, min(1.0, confidence))
    
    return best[1], confidence, best[0] + ": " + (best[1][:30] if best[1] else "N/A")


def extract_date(blocks: List[OCRBlock], field_type: str = "invoice") -> Tuple[Optional[str], float, str]:
    """Extract date (invoice_date or due_date) with comprehensive date detection.
    
    Handles multiple date formats including:
    - ISO format (YYYY-MM-DD)
    - Numeric formats (MM/DD/YYYY, DD/MM/YYYY, etc.)
    - Written dates (March 15, 2050, Nov 1, 2024, etc.)
    
    Returns:
        (date string in YYYY-MM-DD format, confidence, reason)
    """
    if not blocks:
        return None, 0.0, "No blocks available"
    
    # Normalize all block texts
    normalized_blocks = []
    for b in blocks:
        norm_text = normalize_text(b.text)
        normalized_blocks.append({
            'block': b,
            'text_norm': norm_text,
            'text_orig': b.text
        })
    
    # Comprehensive date regex patterns (including written dates)
    DATE_PATTERNS = [
        (re.compile(r'\b\d{4}-\d{2}-\d{2}\b'), 'iso'),  # YYYY-MM-DD
        (re.compile(r'\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b'), 'numeric'),  # MM/DD/YYYY or DD/MM/YYYY
        (re.compile(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b', re.IGNORECASE), 'written_short'),  # Mar 15, 2050
        (re.compile(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b', re.IGNORECASE), 'written_full'),  # March 15, 2050
        (re.compile(r'\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b', re.IGNORECASE), 'written_dmy'),  # 15 Mar 2050
        (re.compile(r'\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b', re.IGNORECASE), 'written_dmy_full'),  # 15 March 2050
    ]
    
    # Label patterns (expanded)
    if field_type == "invoice":
        date_labels = [
            "invoice date", "date of invoice", "bill date", "issue date",
            "invoice dated", "date issued", "invoice issued", "date",
            "receipt date", "transaction date", "document date"
        ]
    else:
        date_labels = ["due date", "payment due", "pay by", "due on", "payment date"]
    
    label_blocks = []
    for nb in normalized_blocks:
        for label in date_labels:
            if label_matches(nb['text_norm'], label, threshold=80):
                label_blocks.append(nb['block'])
                break
    
    candidates = []
    today = datetime.now()
    min_date = datetime(2000, 1, 1)
    max_date = datetime(today.year + 5, 12, 31)
    
    # Strategy 1: Find label + nearby date (highest priority)
    for label_block in label_blocks:
        candidate = find_candidate_near(label_block, blocks, prefer_right=True, max_px=200)
        if candidate:
            text_norm = normalize_text(candidate.text)
            text_orig = candidate.text
            
            # Try all date patterns
            for pattern, pattern_type in DATE_PATTERNS:
                match = pattern.search(text_orig if 'written' in pattern_type else text_norm)
                if match:
                    date_str = match.group(0)
                    try:
                        parsed = date_parser.parse(date_str, fuzzy=True)
                        if isinstance(parsed, datetime):
                            if min_date <= parsed <= max_date:
                                iso_date = parsed.date().isoformat()
                                confidence = 0.90 if pattern_type == 'iso' else 0.85
                                candidates.append(('label_nearby', iso_date, candidate, confidence, 
                                                 f"Found {pattern_type} date near {field_type} date label"))
                                break  # Found a date, move to next label block
                    except (ValueError, TypeError):
                        continue
            
            # If regex didn't match, try fuzzy parsing on the entire candidate text
            candidate_found = any(c[2] == candidate for c in candidates)
            if not candidate_found:
                try:
                    # Try parsing the entire block text as a date
                    parsed = date_parser.parse(text_orig, fuzzy=True, default=datetime.now())
                    if isinstance(parsed, datetime):
                        # Check if it looks like a date (has year, month, day components)
                        if parsed.year >= 2000 and parsed.year <= today.year + 5:
                            iso_date = parsed.date().isoformat()
                            candidates.append(('label_nearby_fuzzy', iso_date, candidate, 0.80, 
                                             f"Fuzzy parsed date near {field_type} date label"))
                except (ValueError, TypeError):
                    pass
    
    # Strategy 2: Global scan with regex patterns (high confidence)
    if not candidates:
        for nb in normalized_blocks:
            for pattern, pattern_type in DATE_PATTERNS:
                match = pattern.search(nb['text_orig'] if 'written' in pattern_type else nb['text_norm'])
                if match:
                    date_str = match.group(0)
                    try:
                        parsed = date_parser.parse(date_str, fuzzy=True)
                        if isinstance(parsed, datetime):
                            if min_date <= parsed <= max_date:
                                iso_date = parsed.date().isoformat()
                                confidence = 0.80 if pattern_type == 'iso' else 0.75
                                candidates.append(('global_regex', iso_date, nb['block'], confidence, 
                                                 f"Found {pattern_type} date in document"))
                                break  # Found a date in this block, move to next
                    except (ValueError, TypeError):
                        continue
    
    # Strategy 3: Fuzzy parsing on blocks that might contain dates
    if not candidates:
        # Look for blocks that contain month names or date-like patterns
        month_names = ['january', 'february', 'march', 'april', 'may', 'june',
                       'july', 'august', 'september', 'october', 'november', 'december',
                       'jan', 'feb', 'mar', 'apr', 'may', 'jun',
                       'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        
        for nb in normalized_blocks:
            text_lower = nb['text_orig'].lower()
            # Check if block contains a month name and numbers
            has_month = any(month in text_lower for month in month_names)
            has_numbers = bool(re.search(r'\d', nb['text_orig']))
            
            if has_month and has_numbers:
                try:
                    parsed = date_parser.parse(nb['text_orig'], fuzzy=True, default=datetime.now())
                    if isinstance(parsed, datetime):
                        if min_date <= parsed <= max_date:
                            iso_date = parsed.date().isoformat()
                            candidates.append(('fuzzy_month', iso_date, nb['block'], 0.70, 
                                             "Fuzzy parsed date with month name"))
                except (ValueError, TypeError):
                    continue
    
    # Strategy 4: Last resort - fuzzy parse all blocks
    if not candidates:
        for nb in normalized_blocks:
            # Skip blocks that are too short or don't look date-like
            if len(nb['text_orig'].strip()) < 5 or len(nb['text_orig'].strip()) > 50:
                continue
            if not re.search(r'\d', nb['text_orig']):  # Must have at least one digit
                continue
            
            try:
                parsed = date_parser.parse(nb['text_orig'], fuzzy=True, default=datetime.now())
                if isinstance(parsed, datetime):
                    if min_date <= parsed <= max_date:
                        iso_date = parsed.date().isoformat()
                        candidates.append(('fuzzy_all', iso_date, nb['block'], 0.60, 
                                         "Fuzzy parsed date from block text"))
            except (ValueError, TypeError):
                continue
    
    if candidates:
        # Sort by confidence (highest first), then by position
        candidates.sort(key=lambda x: (-x[3], x[2].bbox[1]))
        if field_type == "invoice":
            # For invoice dates, prefer earlier dates (top of page)
            return candidates[0][1], candidates[0][3], candidates[0][4]
        else:
            # For due dates, prefer later dates (bottom of page)
            return candidates[-1][1], candidates[-1][3], candidates[-1][4]
    
    return None, 0.0, f"No {field_type} date found"


def extract_total_amount(blocks: List[OCRBlock], invoice_id: Optional[str] = None) -> Tuple[Optional[float], float, str]:
    """Extract total amount with improved scoring-based prioritization.
    
    Args:
        blocks: OCR blocks
        invoice_id: Optional extracted invoice ID to exclude from candidates
    
    Returns:
        (value, confidence, reason)
    """
    if not blocks:
        return None, 0.0, "No blocks available"
    
    # Normalize all block texts (store in a dict to avoid modifying blocks)
    block_norms = {}
    for b in blocks:
        if hasattr(b, 'text'):
            block_norms[id(b)] = normalize_text(b.text)
    
    # Compute page height
    page_height = max(b.bbox[3] for b in blocks) if blocks else 1000
    
    # Compute invoice ID numeric for exclusion
    invoice_id_numeric = None
    if invoice_id:
        digits = re.sub(r'\D', '', str(invoice_id))
        if digits:
            try:
                invoice_id_numeric = float(digits)
            except:
                pass
    
    # Also detect invoice IDs heuristically
    invoice_id_numbers = set()
    if invoice_id:
        invoice_id_clean = re.sub(r'[^\d]', '', str(invoice_id))
        if invoice_id_clean:
            invoice_id_numbers.add(invoice_id_clean)
            try:
                invoice_id_numbers.add(str(int(float(invoice_id_clean))))
            except:
                pass
    
    for b in blocks:
        text_lower = block_norms.get(id(b), normalize_text(b.text)).lower()
        if any(label in text_lower for label in ['invoice no', 'invoice number', 'invoice #', 'inv no', 'inv #']):
            numbers = re.findall(r'\b\d{6,12}\b', b.text)
            for num in numbers:
                if len(num) >= 7:
                    invoice_id_numbers.add(num)
        if b.bbox[1] < 300:
            text_clean = b.text.strip()
            if re.match(r'^\d{7,12}$', text_clean):
                invoice_id_numbers.add(text_clean)
    
    # Find total label blocks first (for proximity boost)
    label_blocks = find_blocks_with_label(blocks, TOTAL_LABELS)
    
    # Collect all candidate amounts with context (optimized: limit search to bottom 60% first)
    candidates = []  # (raw_string, parsed_value, block, has_currency_symbol, bottom_frac, near_label)
    # Pre-compute label Y positions for faster proximity check
    label_y_positions = [lb.bbox[1] for lb in label_blocks] if label_blocks else []
    
    # First pass: prioritize blocks in bottom 60% or near labels (faster)
    priority_blocks = []
    other_blocks = []
    for b in blocks:
        y_ratio = b.bbox[1] / page_height if page_height > 0 else 0
        is_priority = y_ratio >= 0.4 or any(abs(lb_y - b.bbox[1]) < 150 for lb_y in label_y_positions)
        if is_priority:
            priority_blocks.append(b)
        else:
            other_blocks.append(b)
    
    # Process priority blocks first
    for b in priority_blocks + other_blocks[:50]:  # Limit other blocks to top 50 for speed
        text = block_norms.get(id(b), normalize_text(b.text))
        if not text:
            continue
        # Quick proximity check using pre-computed positions
        near_label = any(abs(lb_y - b.bbox[1]) < 100 for lb_y in label_y_positions)
        
        # Find all amount-like substrings using relaxed regex
        for m in AMOUNT_RELAXED.finditer(text):
            raw = m.group(1).strip() if m.groups() else m.group(0).strip()
            if not raw:
                continue
            parsed = parse_amount_str(raw)
            if parsed is None or parsed == 0.0:
                continue
            # Compute bottom fraction
            bbox = b.bbox
            bottom = bbox[3] if bbox else 0
            bottom_frac = (bottom / page_height) if page_height > 0 else 0
            has_sym = bool(re.search(r'(₹|\$|USD|INR|€|EUR|£|GBP|Rs\.)', raw, re.I))
            candidates.append((raw, parsed, b, has_sym, bottom_frac, near_label))
    
    # Scoring: prefer (1) near total label (2) currency symbol (3) bottom-of-page (4) larger amounts (5) decimal presence
    scored = []
    for raw, val, b, has_sym, bottom_frac, near_label in candidates:
        score = 0.0
        
        # Exclude if matches invoice id exactly or numeric-equals invoice id
        if invoice_id and raw.strip() == str(invoice_id).strip():
            continue
        if invoice_id_numeric is not None:
            try:
                if abs(val - invoice_id_numeric) < 0.001:
                    continue
            except:
                pass
        
        # Reject extremely large values
        if val > MAX_TOTAL_DEFAULT:
            continue
        
        # Reject exactly zero (but allow very small amounts like 0.01)
        if val <= 0.0:
            continue
        
        # Also check if amount_int_str matches invoice ID (exclude)
        amount_int_str = str(int(val))
        if amount_int_str in invoice_id_numbers:
            continue  # Skip entirely, don't just penalize
        
        # Additional check: if amount is pure integer and matches invoice ID pattern, exclude
        should_skip = False
        if invoice_id_numbers and float(int(val)) == val:
            val_str = str(int(val))
            # Check if any invoice ID contains this value or vice versa
            for inv_id_num in invoice_id_numbers:
                if val_str in inv_id_num or inv_id_num in val_str:
                    if len(val_str) >= 6:  # Only exclude if it's a substantial match
                        should_skip = True
                        break
            if should_skip:
                continue
        
        # Scoring features (prioritized)
        # 1. Near total label - HUGE boost
        if near_label:
            score += 5.0
        
        # 2. Currency symbol
        if has_sym and PREFER_CURRENCY_SYMBOL:
            score += 3.0
        
        # 3. Bottom-of-page preference
        if page_height and bottom_frac:
            frac = bottom_frac
            if frac >= (1.0 - BOTTOM_PAGE_RATIO):
                score += 2.5
            elif frac >= 0.5:  # Middle to bottom
                score += 1.0
            else:
                score += (frac * 0.3)
        
        # 4. Prefer larger amounts (totals are usually the largest amount on invoice)
        # Normalize by log scale to avoid huge numbers dominating
        if val > 0:
            import math
            log_val = math.log10(max(val, 1))
            score += min(log_val * 0.3, 2.0)  # Cap at 2.0
        
        # 5. Decimals -> likely monetary
        if ('.' in raw) or (',' in raw and re.search(r'\d+,\d{1,2}\b', raw)):
            score += 1.5
        
        # Penalty if parsed value is integer-like but long (>6 digits) and no currency symbol
        if (not has_sym) and (val >= 1000000 or (val >= 100000 and float(int(val)) == val)):
            score -= 3.0
        
        scored.append((score, raw, val, b))
    
    # Select top scored candidate
    if not scored:
        return None, 0.0, "No total amount found"
    
    scored_sorted = sorted(scored, key=lambda x: x[0], reverse=True)
    best_score, best_raw, best_val, best_block = scored_sorted[0]
    
    # Compute confidence scores
    ocr_conf = best_block.confidence if best_block else 0.5
    label_blocks = find_blocks_with_label(blocks, TOTAL_LABELS)
    # Check if best_block is near a total label
    label_score = 0.5
    for lb in label_blocks:
        if abs(lb.bbox[1] - best_block.bbox[1]) < 100:
            label_score = 1.0
            break
    if label_blocks:
        label_score = max(label_score, 0.7)
    
    regex_score = 1.0 if AMOUNT_STRICT.search(best_raw) else 0.6
    
    # Compute final confidence
    confidence = 0.2 + 0.7 * min(ocr_conf, label_score, regex_score)
    confidence = max(0.0, min(1.0, confidence))
    
    reason = f"scored({best_score:.1f}): {best_raw}"
    return best_val, confidence, reason


def extract_currency(blocks: List[OCRBlock], total_amount: Optional[float] = None) -> Tuple[Optional[str], float, str]:
    """Extract currency code.
    
    Args:
        blocks: OCR blocks
        total_amount: Optional total amount to find currency nearby
    
    Returns:
        (ISO4217 code, confidence, reason)
    """
    currency_map = {
        '$': 'USD', 'USD': 'USD', 'US$': 'USD',
        '€': 'EUR', 'EUR': 'EUR',
        '£': 'GBP', 'GBP': 'GBP',
        '¥': 'JPY', 'JPY': 'JPY',
        '₹': 'INR', 'INR': 'INR',
    }
    
    # Strategy 1: Find currency symbol/code near total amount
    if total_amount:
        total_str = f"{total_amount:.2f}"
        for block in blocks:
            if total_str in block.text or str(int(total_amount)) in block.text:
                text = block.text
                
                # Check for currency symbols/codes
                for symbol, code in currency_map.items():
                    if symbol in text or code in text.upper():
                        return code, 0.90, "Found currency near total amount"
    
    # Strategy 2: Search all blocks for currency indicators
    for block in blocks:
        text = block.text.upper()
        
        for symbol, code in currency_map.items():
            if symbol in text or code in text:
                return code, 0.75, f"Found currency indicator: {symbol or code}"
    
    # Default to USD if nothing found
    return 'USD', 0.50, "No currency found, defaulting to USD"


# Tax labels
TAX_LABELS = [
    "tax", "gst", "vat", "sales tax", "total tax",
    "tax amount", "tax total", "taxes", "tax (", "tax:",
    "impuesto", "iva",  # Spanish
    "tva",  # French
]

# Subtotal labels
SUBTOTAL_LABELS = [
    "subtotal", "sub total", "total before tax",
    "amount before tax", "pre-tax total",
    "subtotal antes de impuestos",  # Spanish
]


def extract_tax_amount(blocks: List[OCRBlock], total_amount: Optional[float] = None) -> Tuple[Optional[float], float, str]:
    """Extract tax amount from invoice.
    
    Args:
        blocks: OCR blocks
        total_amount: Optional total amount for validation
    
    Returns:
        (value, confidence, reason)
    """
    if not blocks:
        return None, 0.0, "No blocks available"
    
    # Normalize all block texts
    block_norms = {}
    for b in blocks:
        if hasattr(b, 'text'):
            block_norms[id(b)] = normalize_text(b.text)
    
    # Find tax label blocks
    label_blocks = find_blocks_with_label(blocks, TAX_LABELS)
    
    candidates = []
    chosen_block = None
    
    # Strategy 1: Near tax label
    for lb in label_blocks:
        # Check same block first - look for amount patterns more thoroughly
        lb_norm = block_norms.get(id(lb), normalize_text(lb.text))
        lb_text = lb.text  # Keep original for better matching
        
        # Try to find amount in same block - check for patterns like "Tax (13%): $456.30" or "Tax: 456.30"
        # Look for amount patterns with currency symbols first
        same_block_match = AMOUNT_STRICT.search(lb_norm)
        if not same_block_match:
            same_block_match = AMOUNT_RELAXED.search(lb_norm)
        
        # Also try to extract from patterns like "Tax (13%): $456.30" or "Tax: $456.30"
        if not same_block_match:
            # Look for colon or parenthesis followed by amount
            colon_pattern = re.search(r'[:\(]\s*[^\d]*(\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{1,2})?)', lb_text)
            if colon_pattern:
                raw = colon_pattern.group(1).strip()
                parsed = parse_amount_str(raw)
                if parsed is not None and parsed > 0:
                    candidates.append(('label', parsed, lb, 0.88))
                    chosen_block = lb
                    break
        
        if same_block_match:
            raw = same_block_match.group(1).strip() if same_block_match.groups() else same_block_match.group(0).strip()
            # Remove currency symbols and clean up, but preserve decimal separators
            raw_clean = re.sub(r'[^\d.,\-\+]', '', raw)
            # Handle comma as thousands separator
            if ',' in raw_clean and '.' in raw_clean:
                # Format like 1,234.56
                raw_clean = raw_clean.replace(',', '')
            elif ',' in raw_clean:
                # Could be European format (1,23) or thousands (1,234)
                # If only one comma and 2 digits after, treat as decimal
                parts = raw_clean.split(',')
                if len(parts) == 2 and len(parts[1]) <= 2:
                    raw_clean = raw_clean.replace(',', '.')
                else:
                    raw_clean = raw_clean.replace(',', '')
            parsed = parse_amount_str(raw_clean)
            if parsed is not None and parsed > 0:
                candidates.append(('label', parsed, lb, 0.90))
                chosen_block = lb
                break
        
        # Find nearby block - increase search radius and check below as well
        # Try right first
        nb = find_candidate_near(lb, blocks, prefer_right=True, max_px=600)
        if not nb:
            # Try below
            nb = find_candidate_near(lb, blocks, prefer_right=False, max_px=600)
        
        if nb:
            s = block_norms.get(id(nb), normalize_text(nb.text))
            # Try strict first, then relaxed
            m = AMOUNT_STRICT.search(s)
            if not m:
                m = AMOUNT_RELAXED.search(s)
            if m:
                raw = m.group(1).strip() if m.groups() else m.group(0).strip()
                # Remove currency symbols and clean up
                raw = re.sub(r'[^\d.,\-\+]', '', raw)
                parsed = parse_amount_str(raw)
                if parsed is not None and parsed > 0:
                    candidates.append(('label', parsed, nb, 0.85))
                    chosen_block = nb
                    break
    
    # Strategy 2: Look for amounts near subtotal (tax is often right after subtotal)
    if not candidates:
        subtotal_blocks = find_blocks_with_label(blocks, SUBTOTAL_LABELS)
        for stb in subtotal_blocks:
            # Find block after subtotal (tax usually comes after)
            nb = find_candidate_near(stb, blocks, prefer_right=True, max_px=400)
            if nb:
                s = block_norms.get(id(nb), normalize_text(nb.text))
                m = AMOUNT_STRICT.search(s)
                if not m:
                    m = AMOUNT_RELAXED.search(s)
                if m:
                    raw = m.group(1).strip() if m.groups() else m.group(0).strip()
                    raw = re.sub(r'[^\d.,\-\+]', '', raw)
                    parsed = parse_amount_str(raw)
                    if parsed is not None and parsed > 0:
                        # Validate it's reasonable (tax is usually 5-50% of subtotal)
                        if total_amount:
                            tax_ratio = parsed / total_amount if total_amount > 0 else 0
                            if 0.01 <= tax_ratio <= 0.50:
                                candidates.append(('subtotal_near', parsed, nb, 0.75))
                                if not chosen_block:
                                    chosen_block = nb
                        else:
                            candidates.append(('subtotal_near', parsed, nb, 0.70))
                            if not chosen_block:
                                chosen_block = nb
    
    # Strategy 3: Global scan for tax-like amounts (smaller than total, positive)
    if not candidates and total_amount:
        for b in blocks:
            s = block_norms.get(id(b), normalize_text(b.text))
            # Try strict first, then relaxed
            for m in AMOUNT_STRICT.finditer(s):
                raw = m.group(1).strip() if m.groups() else m.group(0).strip()
                raw = re.sub(r'[^\d.,\-\+]', '', raw)
                parsed = parse_amount_str(raw)
                if parsed is not None and parsed > 0 and parsed < total_amount:
                    # Tax is usually 5-30% of total
                    tax_ratio = parsed / total_amount if total_amount > 0 else 0
                    if 0.01 <= tax_ratio <= 0.50:  # Reasonable tax range
                        candidates.append(('global', parsed, b, 0.60))
                        if not chosen_block:
                            chosen_block = b
            # Also try relaxed pattern
            for m in AMOUNT_RELAXED.finditer(s):
                raw = m.group(1).strip() if m.groups() else m.group(0).strip()
                raw = re.sub(r'[^\d.,\-\+]', '', raw)
                parsed = parse_amount_str(raw)
                if parsed is not None and parsed > 0 and parsed < total_amount:
                    # Tax is usually 5-30% of total
                    tax_ratio = parsed / total_amount if total_amount > 0 else 0
                    if 0.01 <= tax_ratio <= 0.50:  # Reasonable tax range
                        candidates.append(('global', parsed, b, 0.55))
                        if not chosen_block:
                            chosen_block = b
    
    if not candidates:
        return None, 0.0, "No tax amount found"
    
    # Select best candidate (prefer label-based)
    candidates.sort(key=lambda x: (
        0 if x[0] == 'label' else 1,
        -x[3]  # Then by confidence
    ))
    best = candidates[0]
    
    # Compute confidence
    ocr_c = chosen_block.confidence if chosen_block else 0.5
    label_score = 1.0 if label_blocks else 0.5
    regex_score = 1.0 if AMOUNT_STRICT.search(str(best[1])) else 0.6
    
    confidence = 0.2 + 0.7 * min(ocr_c, label_score, regex_score)
    confidence = max(0.0, min(1.0, confidence))
    
    return best[1], confidence, f"{best[0]}: {best[1]}"


def extract_subtotal(blocks: List[OCRBlock], total_amount: Optional[float] = None) -> Tuple[Optional[float], float, str]:
    """Extract subtotal amount from invoice.
    
    Args:
        blocks: OCR blocks
        total_amount: Optional total amount for validation
    
    Returns:
        (value, confidence, reason)
    """
    if not blocks:
        return None, 0.0, "No blocks available"
    
    # Normalize all block texts
    block_norms = {}
    for b in blocks:
        if hasattr(b, 'text'):
            block_norms[id(b)] = normalize_text(b.text)
    
    # Find subtotal label blocks
    label_blocks = find_blocks_with_label(blocks, SUBTOTAL_LABELS)
    
    candidates = []
    chosen_block = None
    
    # Strategy 1: Near subtotal label
    for lb in label_blocks:
        # Check same block first
        lb_norm = block_norms.get(id(lb), normalize_text(lb.text))
        same_block_match = AMOUNT_RELAXED.search(lb_norm)
        if same_block_match:
            raw = same_block_match.group(1).strip() if same_block_match.groups() else same_block_match.group(0).strip()
            parsed = parse_amount_str(raw)
            if parsed is not None and parsed > 0:
                candidates.append(('label', parsed, lb, 0.90))
                chosen_block = lb
                break
        
        # Find nearby block
        nb = find_candidate_near(lb, blocks, prefer_right=True, max_px=500)
        if nb:
            s = block_norms.get(id(nb), normalize_text(nb.text))
            m = AMOUNT_RELAXED.search(s)
            if m:
                raw = m.group(1).strip() if m.groups() else m.group(0).strip()
                parsed = parse_amount_str(raw)
                if parsed is not None and parsed > 0:
                    candidates.append(('label', parsed, nb, 0.85))
                    chosen_block = nb
                    break
    
    # Strategy 2: Global scan (subtotal should be close to total, but less)
    if not candidates and total_amount:
        for b in blocks:
            s = block_norms.get(id(b), normalize_text(b.text))
            for m in AMOUNT_RELAXED.finditer(s):
                raw = m.group(1).strip() if m.groups() else m.group(0).strip()
                parsed = parse_amount_str(raw)
                if parsed is not None and parsed > 0 and parsed < total_amount:
                    # Subtotal should be 80-99% of total (if tax is small)
                    ratio = parsed / total_amount if total_amount > 0 else 0
                    if 0.80 <= ratio <= 0.99:
                        candidates.append(('global', parsed, b, 0.65))
                        if not chosen_block:
                            chosen_block = b
    
    if not candidates:
        return None, 0.0, "No subtotal found"
    
    # Select best candidate (prefer label-based)
    candidates.sort(key=lambda x: (
        0 if x[0] == 'label' else 1,
        -x[3]  # Then by confidence
    ))
    best = candidates[0]
    
    # Compute confidence
    ocr_c = chosen_block.confidence if chosen_block else 0.5
    label_score = 1.0 if label_blocks else 0.5
    regex_score = 1.0 if AMOUNT_STRICT.search(str(best[1])) else 0.6
    
    confidence = 0.2 + 0.7 * min(ocr_c, label_score, regex_score)
    confidence = max(0.0, min(1.0, confidence))
    
    return best[1], confidence, f"{best[0]}: {best[1]}"


def extract_vendor_name(blocks: List[OCRBlock]) -> Tuple[Optional[str], float, str]:
    """Extract vendor name with enhanced section detection and text reconstruction.
    
    Returns:
        (vendor name, confidence, reason)
    """
    # Reconstruct full text for better pattern matching
    from app.text_reconstruction import reconstruct_text_from_blocks
    full_text = reconstruct_text_from_blocks(blocks)
    
    # Strategy 1: Find vendor labels (multilingual, expanded) - but be more selective
    vendor_labels = [
        "from", "seller", "vendor", "supplier", "company",
        "bill to", "sold by", "merchant",
        "empresa", "fornecedor", "emitente",  # Portuguese
        "proveedor", "emisor",  # Spanish
    ]
    label_candidates = find_label_proximity(blocks, vendor_labels, max_distance=150)  # Reduced distance
    
    if label_candidates:
        # Get only the immediate next 1-2 blocks (not all nearby)
        vendor_text = []
        seen_texts = set()
        for block, distance in label_candidates[:3]:  # Only top 3 candidates
            block_text = block.text.strip()
            if block_text and block_text not in seen_texts:
                # Skip if it looks like address/phone/email
                if any(skip in block_text.lower() for skip in ['@', '(', ')', 'phone', 'email', 'address', 'att:', 'po']):
                    continue
                vendor_text.append(block_text)
                seen_texts.add(block_text)
                if len(vendor_text) >= 2:  # Max 2 blocks
                    break
        
        if vendor_text:
            # Combine and clean
            vendor_name = " ".join(vendor_text)
            # Remove common prefixes
            vendor_name = re.sub(
                r"^(bill\s*to|from|vendor|supplier|empresa|fornecedor|emitente|company|business|seller):?\s*", 
                "", vendor_name, flags=re.IGNORECASE
            ).strip()
            # Remove extra whitespace
            vendor_name = re.sub(r'\s+', ' ', vendor_name).strip()
            
            # Stop at common separators (address, phone, etc.)
            for sep in ['Att:', 'Phone', 'Email', '@', '(', 'PO', 'Invoice']:
                if sep in vendor_name:
                    vendor_name = vendor_name.split(sep)[0].strip()
                    break
            
            # Limit to reasonable length
            if len(vendor_name) > 80:
                words = vendor_name.split()
                vendor_name = " ".join(words[:8])  # Max 8 words
            
            if 3 < len(vendor_name) < 100:  # Reasonable length
                return vendor_name, 0.85, "Found near vendor label"
    
    # Strategy 2: Search in full reconstructed text for company patterns
    # Look for company suffixes in full text
    company_patterns = [
        r'([A-Z][A-Za-z\s&,.-]{5,50}?\s+(?:Ltd|Limited|Inc|Incorporated|LLC|Corp|Corporation|SA|S\.A\.|GmbH|AG|BV|Pty|Ltd\.))',
        r'([A-Z][A-Za-z\s&,.-]{5,50}?\s+(?:Company|Co\.|Co|Trading|Business|Group))',
    ]
    
    for pattern in company_patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            vendor_name = match.group(1).strip()
            if len(vendor_name) > 5:
                return vendor_name, 0.80, "Found company pattern in text"
    
    # Strategy 3: Find company name in top-left (common invoice layout) - optimized
    top_left_blocks = sorted(blocks, key=lambda b: (b.bbox[1], b.bbox[0]))[:15]  # Reduced for speed
    
    vendor_candidates = []
    for i, block in enumerate(top_left_blocks):
        text = block.text.strip()
        
        # Check if it looks like a company name with suffix (fast check)
        if any(suffix.lower() in text.lower() for suffix in ['ltd', 'inc', 'llc', 'corp', 'company', 'co']):
            vendor_candidates.append((text, 0.85, i))
        
        # Check if it's a multi-word capitalized phrase (likely company name)
        words = text.split()
        if len(words) >= 2 and len(text) > 5:
            # Quick capitalization check
            caps_count = sum(1 for w in words if w and w[0].isupper())
            if caps_count >= len(words) * 0.6:
                score = 0.70 + (min(len(text) / 100, 0.1))
                vendor_candidates.append((text, score, i))
    
    # Try combining only first 2-3 blocks (faster)
    for i in range(min(2, len(top_left_blocks))):
        for j in range(i+1, min(i+3, len(top_left_blocks))):
            combined = " ".join([b.text.strip() for b in top_left_blocks[i:j+1]])
            if len(combined) > 5:
                words = combined.split()
                caps_count = sum(1 for w in words if w and w[0].isupper())
                if caps_count >= len(words) * 0.5:
                    if any(suffix.lower() in combined.lower() for suffix in ['ltd', 'inc', 'llc', 'corp', 'company']):
                        vendor_candidates.append((combined, 0.90, i))
                    else:
                        vendor_candidates.append((combined, 0.75, i))
    
    if vendor_candidates:
        # Return highest confidence candidate, prefer earlier in document
        vendor_candidates.sort(key=lambda x: (x[1], -x[2]), reverse=True)
        best = vendor_candidates[0]
        return best[0], best[1], "Found company name in top-left region"
    
    # Strategy 4: Look for longest capitalized text block in top region
    top_blocks = sorted(blocks, key=lambda b: b.bbox[1])[:30]
    for block in top_blocks:
        text = block.text.strip()
        if len(text) > 8 and text[0].isupper():
            words = text.split()
            if len(words) >= 2:
                # Prefer longer names
                return text, 0.65, "Found capitalized text in top region"
    
    # Strategy 5: Look for email domain (fast - search in blocks directly)
    email_pattern = r'@([A-Za-z0-9.-]+\.[A-Za-z]{2,})'
    for block in top_left_blocks[:10]:
        email_match = re.search(email_pattern, block.text)
        if email_match:
            domain = email_match.group(1)
            company_from_domain = domain.split('.')[0]
            if len(company_from_domain) > 3:
                # Check nearby blocks
                for nearby_block in top_left_blocks[:5]:
                    if company_from_domain.lower() in nearby_block.text.lower():
                        return nearby_block.text.strip(), 0.60, "Found via email domain"
    
    return None, 0.0, "No vendor name found"

