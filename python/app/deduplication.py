"""Enhanced deduplication with near-duplicate detection."""
import hashlib
from typing import Dict, List, Set, Optional, Tuple
from app.models import InvoiceExtract


def compute_dedupe_hash(vendor_id: Optional[str], invoice_id: Optional[str], 
                        total_amount: Optional[float], invoice_date: Optional[str]) -> Optional[str]:
    """Compute dedupe hash for exact duplicate detection.
    
    Args:
        vendor_id: Canonical vendor ID
        invoice_id: Invoice ID
        total_amount: Total amount
        invoice_date: Invoice date (YYYY-MM-DD)
    
    Returns:
        SHA256 hash or None
    """
    if not all([vendor_id, invoice_id, total_amount, invoice_date]):
        return None
    
    hash_str = f"{vendor_id}|{invoice_id}|{total_amount}|{invoice_date}"
    return hashlib.sha256(hash_str.encode('utf-8')).hexdigest()


def compute_fuzzy_hash(vendor_id: Optional[str], invoice_id: Optional[str], 
                       total_amount: Optional[float], invoice_date: Optional[str],
                       tolerance: float = 0.01) -> Optional[str]:
    """Compute fuzzy hash for near-duplicate detection.
    
    Args:
        vendor_id: Canonical vendor ID
        invoice_id: Invoice ID
        total_amount: Total amount
        invoice_date: Invoice date (YYYY-MM-DD)
        tolerance: Amount tolerance for fuzzy matching
    
    Returns:
        Fuzzy hash string or None
    """
    if not all([vendor_id, invoice_id, total_amount, invoice_date]):
        return None
    
    # Round amount to tolerance level for fuzzy matching
    rounded_amount = round(total_amount / tolerance) * tolerance
    
    # Normalize invoice ID (remove spaces, case-insensitive)
    normalized_id = str(invoice_id).strip().upper().replace(" ", "")
    
    hash_str = f"{vendor_id}|{normalized_id}|{rounded_amount:.2f}|{invoice_date}"
    return hashlib.sha256(hash_str.encode('utf-8')).hexdigest()


def detect_near_duplicates(invoice_data: Dict, existing_invoices: List[Dict], 
                          similarity_threshold: float = 0.95) -> List[Tuple[str, float]]:
    """Detect near-duplicate invoices using fuzzy matching.
    
    Args:
        invoice_data: Current invoice data
        existing_invoices: List of existing invoice data dicts
        similarity_threshold: Similarity threshold (0-1)
    
    Returns:
        List of (job_id, similarity_score) tuples
    """
    from rapidfuzz import fuzz
    
    near_duplicates = []
    
    vendor_id = invoice_data.get("vendor_id")
    invoice_id = invoice_data.get("invoice_id")
    total_amount = invoice_data.get("total_amount")
    invoice_date = invoice_data.get("invoice_date")
    
    if not all([vendor_id, invoice_id, total_amount, invoice_date]):
        return near_duplicates
    
    # Build comparison string
    current_str = f"{vendor_id} {invoice_id} {total_amount} {invoice_date}"
    
    for existing in existing_invoices:
        existing_vendor = existing.get("vendor_id")
        existing_id = existing.get("invoice_id")
        existing_amount = existing.get("total_amount")
        existing_date = existing.get("invoice_date")
        
        if not all([existing_vendor, existing_id, existing_amount, existing_date]):
            continue
        
        # Check exact match first (skip)
        if (existing_vendor == vendor_id and existing_id == invoice_id and
            existing_amount == total_amount and existing_date == invoice_date):
            continue
        
        # Build comparison string
        existing_str = f"{existing_vendor} {existing_id} {existing_amount} {existing_date}"
        
        # Compute similarity
        similarity = fuzz.ratio(current_str.lower(), existing_str.lower()) / 100.0
        
        if similarity >= similarity_threshold:
            near_duplicates.append((existing.get("job_id", "unknown"), similarity))
    
    return sorted(near_duplicates, key=lambda x: x[1], reverse=True)


def check_duplicates(invoice_data: Dict, existing_hashes: Set[str], 
                    existing_invoices: List[Dict] = None) -> Tuple[bool, bool, List[Tuple[str, float]]]:
    """Check for exact and near-duplicates.
    
    Args:
        invoice_data: Current invoice data
        existing_hashes: Set of existing dedupe hashes
        existing_invoices: Optional list of existing invoice data for near-duplicate detection
    
    Returns:
        (is_exact_duplicate, is_near_duplicate, near_duplicate_list)
    """
    vendor_id = invoice_data.get("vendor_id")
    invoice_id = invoice_data.get("invoice_id")
    total_amount = invoice_data.get("total_amount")
    invoice_date = invoice_data.get("invoice_date")
    
    # Check exact duplicate
    dedupe_hash = compute_dedupe_hash(vendor_id, invoice_id, total_amount, invoice_date)
    is_exact_duplicate = dedupe_hash in existing_hashes if dedupe_hash else False
    
    # Check near-duplicates
    is_near_duplicate = False
    near_duplicates = []
    if existing_invoices and not is_exact_duplicate:
        near_duplicates = detect_near_duplicates(invoice_data, existing_invoices)
        is_near_duplicate = len(near_duplicates) > 0
    
    return is_exact_duplicate, is_near_duplicate, near_duplicates

