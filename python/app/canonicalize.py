"""Canonicalization for dates, currency, and vendor names."""
import re
from typing import Optional, Tuple
from datetime import datetime
from dateutil import parser as date_parser
from pathlib import Path
import csv
from rapidfuzz import fuzz
from app.utils import get_project_root


# ISO4217 currency codes
CURRENCY_MAP = {
    'USD': 'USD', 'US$': 'USD', '$': 'USD', 'dollar': 'USD',
    'EUR': 'EUR', '€': 'EUR', 'euro': 'EUR',
    'GBP': 'GBP', '£': 'GBP', 'pound': 'GBP',
    'INR': 'INR', '₹': 'INR', 'rupee': 'INR',
    'JPY': 'JPY', '¥': 'JPY', 'yen': 'JPY',
    'CAD': 'CAD', 'C$': 'CAD',
    'AUD': 'AUD', 'A$': 'AUD',
}


class VendorCanonicalizer:
    """Canonicalize vendor names using fuzzy matching."""
    
    def __init__(self, vendors_csv_path: Optional[Path] = None):
        """Initialize vendor canonicalizer.
        
        Args:
            vendors_csv_path: Path to vendors.csv file
        """
        if vendors_csv_path is None:
            vendors_csv_path = get_project_root() / "data" / "vendors.csv"
        
        self.vendors = []
        self.load_vendors(vendors_csv_path)
    
    def load_vendors(self, csv_path: Path):
        """Load vendors from CSV.
        
        Expected format: canonical_id,name,aliases,tax_id
        """
        if not csv_path.exists():
            # Create sample vendors file
            self._create_sample_vendors(csv_path)
            return
        
        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    self.vendors.append({
                        'canonical_id': row.get('canonical_id', '').strip(),
                        'name': row.get('name', '').strip(),
                        'aliases': [a.strip() for a in row.get('aliases', '').split('|') if a.strip()],
                        'tax_id': row.get('tax_id', '').strip()
                    })
        except Exception as e:
            print(f"Failed to load vendors CSV: {e}")
            self._create_sample_vendors(csv_path)
    
    def _create_sample_vendors(self, csv_path: Path):
        """Create sample vendors CSV."""
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        sample_vendors = [
            ['canonical_id', 'name', 'aliases', 'tax_id'],
            ['acme_corp', 'ACME Corporation', 'ACME Corp|Acme Corp|ACME Inc', 'TAX123456'],
            ['microsoft', 'Microsoft Corporation', 'Microsoft Corp|MSFT|Microsoft Inc', 'TAX789012'],
            ['amazon', 'Amazon.com Inc', 'Amazon|Amazon.com|AMZN', 'TAX345678'],
        ]
        
        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(sample_vendors)
        
        self.load_vendors(csv_path)
    
    def canonicalize(self, vendor_name: str) -> Tuple[Optional[str], Optional[str], float, str]:
        """Canonicalize vendor name using fuzzy matching.
        
        Args:
            vendor_name: Raw vendor name
        
        Returns:
            (canonical_id, canonical_name, confidence, reason)
        """
        if not vendor_name or not vendor_name.strip():
            return None, None, 0.0, "Empty vendor name"
        
        vendor_name_clean = vendor_name.strip()
        
        # Try exact match first
        for vendor in self.vendors:
            if vendor['name'].lower() == vendor_name_clean.lower():
                return vendor['canonical_id'], vendor['name'], 1.0, "Exact match"
            
            # Check aliases
            for alias in vendor['aliases']:
                if alias.lower() == vendor_name_clean.lower():
                    return vendor['canonical_id'], vendor['name'], 0.95, f"Exact alias match: {alias}"
        
        # Fuzzy matching
        best_match = None
        best_score = 0.0
        
        for vendor in self.vendors:
            # Match against name
            score = fuzz.token_sort_ratio(vendor['name'], vendor_name_clean)
            if score > best_score:
                best_score = score
                best_match = vendor
            
            # Match against aliases
            for alias in vendor['aliases']:
                score = fuzz.token_sort_ratio(alias, vendor_name_clean)
                if score > best_score:
                    best_score = score
                    best_match = vendor
        
        if best_match and best_score >= 92:
            return best_match['canonical_id'], best_match['name'], 0.90, f"Fuzzy match (score: {best_score:.0f})"
        elif best_match and best_score >= 75:
            return best_match['canonical_id'], best_match['name'], 0.70, f"Fuzzy match suggested (score: {best_score:.0f})"
        else:
            # New vendor - create canonical ID from name
            canonical_id = re.sub(r'[^a-z0-9]', '_', vendor_name_clean.lower())
            canonical_id = re.sub(r'_+', '_', canonical_id).strip('_')
            return canonical_id, vendor_name_clean, 0.50, "New vendor (no match found)"


def canonicalize_date(date_str: Optional[str]) -> Optional[str]:
    """Canonicalize date to YYYY-MM-DD format.
    
    Handles various date formats including:
    - ISO format (YYYY-MM-DD)
    - Numeric formats (MM/DD/YYYY, DD/MM/YYYY, etc.)
    - Written dates (March 15, 2050, Nov 1, 2024, etc.)
    
    Args:
        date_str: Date string in any format
    
    Returns:
        ISO date string (YYYY-MM-DD) or None if invalid
    """
    if not date_str:
        return None
    
    # If already in ISO format, validate and return
    if isinstance(date_str, str) and re.match(r'^\d{4}-\d{2}-\d{2}$', date_str.strip()):
        try:
            # Validate the date
            parsed_date = datetime.strptime(date_str.strip(), '%Y-%m-%d').date()
            today = datetime.now().date()
            min_date = datetime(2000, 1, 1).date()
            max_date = datetime(today.year + 5, 12, 31).date()
            if min_date <= parsed_date <= max_date:
                return date_str.strip()
        except (ValueError, TypeError):
            pass
    
    try:
        parsed = date_parser.parse(str(date_str), fuzzy=True)
        if isinstance(parsed, datetime):
            # Validate date range (2000 to 5 years in future)
            today = datetime.now()
            min_date = datetime(2000, 1, 1)
            max_date = datetime(today.year + 5, 12, 31)
            if min_date <= parsed <= max_date:
                return parsed.date().isoformat()
    except (ValueError, TypeError, AttributeError):
        pass
    
    return None


def canonicalize_currency(currency_str: Optional[str]) -> Optional[str]:
    """Canonicalize currency to ISO4217 code.
    
    Args:
        currency_str: Currency string (symbol, code, or name)
    
    Returns:
        ISO4217 code or None
    """
    if not currency_str:
        return None
    
    currency_upper = str(currency_str).upper().strip()
    
    # Direct lookup
    if currency_upper in CURRENCY_MAP:
        return CURRENCY_MAP[currency_upper]
    
    # Partial match
    for key, code in CURRENCY_MAP.items():
        if key in currency_upper or currency_upper in key:
            return code
    
    # Default to USD if unrecognized
    return 'USD'


def canonicalize_amount(amount_str: Optional[str]) -> Optional[float]:
    """Canonicalize amount string to float.
    
    Args:
        amount_str: Amount string (may include currency symbols, commas)
    
    Returns:
        Float value or None
    """
    if not amount_str:
        return None
    
    # Remove currency symbols and extract number
    amount_clean = re.sub(r'[^\d.,-]', '', str(amount_str))
    
    # Handle comma as thousand separator
    if ',' in amount_clean and '.' in amount_clean:
        # Format: 1,234.56
        amount_clean = amount_clean.replace(',', '')
    elif ',' in amount_clean:
        # Could be 1,234 or 1,234,56 (European format)
        parts = amount_clean.split(',')
        if len(parts) == 2 and len(parts[1]) <= 2:
            # European format: 1,23
            amount_clean = amount_clean.replace(',', '.')
        else:
            # Thousand separator
            amount_clean = amount_clean.replace(',', '')
    
    try:
        return float(amount_clean)
    except:
        return None

