"""Utility functions for InvoiceAce."""
import hashlib
import json
import os
import unicodedata
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent


def normalize_text(s: str) -> str:
    """Normalize OCR text aggressively: NFKC, collapse whitespace, replace weird chars.
    
    Args:
        s: Input text
    
    Returns:
        Normalized text
    """
    if not s:
        return ""
    s = str(s)
    # NFKC normalization (handles composed characters, compatibility variants)
    s = unicodedata.normalize("NFKC", s)
    # Replace common dash variants and weird spaces
    s = s.replace('\u2013', '-').replace('\u2014', '-')  # en/em dash
    s = s.replace('\u00A0', ' ')  # non-breaking space
    # Remove zero-width characters and other invisible chars
    s = re.sub(r'[\u200b-\u200d\uFEFF]', '', s)  # zero-width noise, BOM
    # Replace newlines with spaces
    s = s.replace('\n', ' ').replace('\r', ' ')
    # Collapse all whitespace to single space
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def label_matches(text: str, label: str, threshold: int = 80) -> bool:
    """Check if label matches text using exact or fuzzy token matching.
    
    Args:
        text: Text to search in
        label: Label pattern to find
        threshold: Fuzzy match threshold (0-100)
    
    Returns:
        True if label matches
    """
    try:
        from rapidfuzz import fuzz
    except ImportError:
        # Fallback to simple substring if RapidFuzz not available
        return label.lower() in text.lower()
    
    # Normalize and tokenize
    t = re.sub(r'[:\.\-]', ' ', text.lower())
    tokens = t.split()
    label_tokens = label.lower().split()
    
    # Exact contiguous check
    text_joined = ' '.join(tokens)
    label_joined = ' '.join(label_tokens)
    if label_joined in text_joined:
        return True
    
    # Fuzzy token-level matching
    score = fuzz.partial_ratio(text_joined, label_joined)
    return score >= threshold


def find_candidate_near(label_block, blocks, prefer_right: bool = True, max_px: float = 600):
    """Find candidate block near label using proximity + geometric heuristics.
    
    Args:
        label_block: Label block (OCRBlock or dict with bbox)
        blocks: List of candidate blocks
        prefer_right: Prefer blocks to the right of label
        max_px: Maximum distance in pixels
    
    Returns:
        Best candidate block or None
    """
    if not blocks:
        return None
    
    # Get label bbox
    if hasattr(label_block, 'bbox'):
        lx1, ly1, lx2, ly2 = label_block.bbox
    else:
        lx1, ly1, lx2, ly2 = label_block.get('bbox', [0, 0, 0, 0])
    
    l_cx = (lx1 + lx2) / 2
    l_cy = (ly1 + ly2) / 2
    l_h = ly2 - ly1 if ly2 > ly1 else 20
    
    best = None
    best_score = 1e9
    
    for b in blocks:
        if b is label_block:
            continue
        
        # Get block bbox
        if hasattr(b, 'bbox'):
            bx1, by1, bx2, by2 = b.bbox
        else:
            bx1, by1, bx2, by2 = b.get('bbox', [0, 0, 0, 0])
        
        b_cx = (bx1 + bx2) / 2
        b_cy = (by1 + by2) / 2
        
        # Compute distance with penalties
        dx = b_cx - l_cx
        dy = b_cy - l_cy
        
        penalty = 0
        if prefer_right and dx < -10:  # Strongly penalize left-of-label
            penalty += 10000
        
        # Prefer vertically aligned (within 2x label height)
        if abs(dy - l_cy) > l_h * 2:
            penalty += 500
        
        dist = (dx * dx + dy * dy) ** 0.5 + penalty
        
        if dist < best_score:
            best_score = dist
            best = b
    
    return best if best_score < max_px else None


def parse_amount_str(s: str) -> Optional[float]:
    """Parse amount string with robust European/US format handling.
    
    Args:
        s: Amount string
    
    Returns:
        Parsed float or None
    """
    if not s:
        return None
    t = str(s).strip()
    # Remove currency symbols & non-number separators, but keep , and .
    # Keep minus/plus sign if present
    t_clean = re.sub(r"[^\d,.\-]", "", t)
    if t_clean == "":
        return None

    # Heuristic: if both '.' and ',' present, decide decimal separator by last occurrence
    if '.' in t_clean and ',' in t_clean:
        if t_clean.rfind(',') > t_clean.rfind('.'):
            # comma likely decimal sep: remove dots (thousands), replace last comma -> '.'
            t_clean = t_clean.replace('.', '')
            t_clean = t_clean.replace(',', '.')
        else:
            # dot is decimal, remove commas
            t_clean = t_clean.replace(',', '')
    else:
        # only commas (eg 1.234 or 1,234) — decide by grouping: if commas used as thousands (group of 3)
        # If more than one comma or comma followed by exactly 3 digits -> thousands grouping -> remove commas
        if t_clean.count(',') > 1 or re.search(r',\d{3}\b', t_clean):
            t_clean = t_clean.replace(',', '')
        else:
            # single comma with 2 digits -> treat as decimal
            if re.search(r',\d{1,2}\b', t_clean) and '.' not in t_clean:
                t_clean = t_clean.replace(',', '.')
            else:
                t_clean = t_clean.replace(',', '')

    # remove leading/trailing rogue dots
    t_clean = re.sub(r'^[^\d\-]+', '', t_clean)
    t_clean = re.sub(r'[^\d\.]+$', '', t_clean)

    try:
        return float(t_clean)
    except (ValueError, TypeError):
        return None


def normalize_vendor_name(s: str) -> str:
    """Normalize vendor name for matching.
    
    Args:
        s: Vendor name
    
    Returns:
        Normalized vendor name
    """
    s = normalize_text(s).lower()
    # Remove common suffixes
    s = re.sub(r'\b(pvt|ltd|private|inc|co|company|llc|corp|corporation)\b\.?', '', s)
    s = re.sub(r'[^a-z0-9\s]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def ensure_dir(path: Path) -> Path:
    """Ensure directory exists, create if not."""
    path.mkdir(parents=True, exist_ok=True)
    return path


def compute_hash(text: str) -> str:
    """Compute SHA256 hash of text for caching."""
    return hashlib.sha256(text.encode()).hexdigest()


def load_json(path: Path) -> Dict[str, Any]:
    """Load JSON file."""
    if not path.exists():
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path: Path, data: Dict[str, Any]) -> None:
    """Save JSON file."""
    ensure_dir(path.parent)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_upload_path(job_id: str, filename: str) -> Path:
    """Get path for uploaded file."""
    uploads_dir = ensure_dir(get_project_root() / "uploads")
    return uploads_dir / f"{job_id}_{filename}"


def get_cache_path(cache_type: str, key: str) -> Path:
    """Get path for cache file."""
    cache_dir = ensure_dir(get_project_root() / "cache" / cache_type)
    return cache_dir / f"{key}.json"


def get_output_path(job_id: str, ext: str = "json") -> Path:
    """Get path for processed output."""
    outputs_dir = ensure_dir(get_project_root() / "data" / "outputs")
    return outputs_dir / f"{job_id}.{ext}"


def timeit(name: str, fn, *args, **kwargs):
    """Time a function call and return result with timing.
    
    Args:
        name: Name of the operation (for logging)
        fn: Function to call
        *args: Positional arguments
        **kwargs: Keyword arguments
    
    Returns:
        (result, elapsed_time)
    """
    import time
    t0 = time.time()
    try:
        res = fn(*args, **kwargs)
        elapsed = time.time() - t0
        return res, elapsed
    except Exception as e:
        elapsed = time.time() - t0
        raise e


def compute_file_sha256(file_path: Path) -> str:
    """Compute SHA256 hash of file for caching.
    
    Args:
        file_path: Path to file
    
    Returns:
        SHA256 hex digest
    """
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def compute_text_sha1(text: str) -> str:
    """Compute SHA1 hash of text for LLM caching.
    
    Args:
        text: Text to hash
    
    Returns:
        SHA1 hex digest
    """
    return hashlib.sha1(text.encode('utf-8')).hexdigest()

